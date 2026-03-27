const mongoose = require("mongoose");
require("dotenv").config({ path: "/Users/wilfredonoyola/workspace/futbolify/futbolify-backend-v2/.env" });

async function checkResults() {
  await mongoose.connect(process.env.MONGODB_URI);

  const picks = await mongoose.connection.db.collection("betting_picks").find({
    kickoff: {
      $gte: new Date("2026-03-27T00:00:00Z"),
      $lt: new Date("2026-03-28T00:00:00Z")
    }
  }).sort({ kickoff: 1 }).toArray();

  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║         📊 RESULTADOS PICKS - 27 MARZO 2026                  ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝\n");

  let wins = 0, losses = 0, pending = 0, totalProfit = 0;

  picks.forEach((p, i) => {
    const hora = new Date(p.kickoff).toLocaleTimeString("es", {
      hour: "2-digit", minute: "2-digit", timeZone: "America/Santo_Domingo"
    });

    let statusIcon = "⏳";
    let resultText = "PENDIENTE";

    if (p.status === "WON") {
      statusIcon = "✅";
      resultText = "GANADO";
      wins++;
      totalProfit += (p.oddsAtDetection - 1) * p.stake;
    } else if (p.status === "LOST") {
      statusIcon = "❌";
      resultText = "PERDIDO";
      losses++;
      totalProfit -= p.stake;
    } else if (p.status === "VOID" || p.status === "PUSH") {
      statusIcon = "🔄";
      resultText = p.status;
    } else {
      pending++;
    }

    const mercado = p.market.replace(/_/g, " ").toUpperCase();
    const h1Home = p.matchResult ? (p.matchResult.homeGoals1H || 0) : "?";
    const h1Away = p.matchResult ? (p.matchResult.awayGoals1H || 0) : "?";
    const result = p.matchResult ? h1Home + "-" + h1Away + " (1H)" : "---";

    console.log(statusIcon + " " + p.teamHome.name + " vs " + p.teamAway.name);
    console.log("   🎯 " + mercado + " @ " + (p.oddsAtDetection || 0).toFixed(2));
    console.log("   🕐 " + hora + " | Resultado 1H: " + result);
    console.log("   📊 Status: " + resultText);
    if (p.matchResult && p.matchResult.homeCorners !== undefined) {
      const totalCorners = p.matchResult.homeCorners + p.matchResult.awayCorners;
      console.log("   📐 Corners: " + totalCorners);
    }
    console.log("");
  });

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("📊 RESUMEN: ✅ " + wins + " ganados | ❌ " + losses + " perdidos | ⏳ " + pending + " pendientes");
  const profitSign = totalProfit >= 0 ? "+" : "";
  console.log("💰 Profit: " + profitSign + totalProfit.toFixed(2) + " unidades");
  console.log("═══════════════════════════════════════════════════════════════");

  await mongoose.disconnect();
}

checkResults().catch(console.error);
