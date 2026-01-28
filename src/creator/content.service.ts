import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContentSuggestion,
  ContentSuggestionsResponse,
  ContentMeta,
  ContentType,
  ContentPriority,
  PageType,
} from './dto/content-suggestion.output';
import { FetchContentInput } from './dto/fetch-content.input';

// ============================================================================
// TYPES
// ============================================================================

interface ContentSource {
  id: string;
  name: string;
  type: 'rss' | 'api' | 'scrape';
  url: string;
  language: string;
  category: 'news' | 'transfers' | 'stats' | 'general';
  leagues?: string[];
  refreshInterval: number;
  priority: number;
  active: boolean;
}

interface RawContentItem {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceLanguage: string;
  title: string;
  description: string;
  link: string;
  pubDate: Date;
  imageUrl?: string;
  category?: string;
}

interface ProcessedContent {
  id: string;
  type: ContentType;
  priority: ContentPriority;
  title: string;
  description: string;
  source: string;
  sourceUrl: string;
  originalLanguage: string;
  imageUrl?: string;
  pubDate: Date;
  suggestedTemplates: string[];
  suggestedCaption?: string;
  hashtags: string[];
  relevanceScore: number;
  templateData?: Record<string, string>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTENT_SOURCES: ContentSource[] = [
  // Spanish sources
  {
    id: 'marca-futbol',
    name: 'MARCA Fútbol',
    type: 'rss',
    url: 'https://e00-xlk-ue-marca.uecdn.es/rss/googlenews/portada.xml',
    language: 'es',
    category: 'news',
    leagues: ['la-liga'],
    refreshInterval: 15,
    priority: 8,
    active: true,
  },
  {
    id: 'as-futbol',
    name: 'AS Fútbol',
    type: 'rss',
    url: 'https://feeds.as.com/mrss-s/pages/as/site/as.com/section/futbol/portada/',
    language: 'es',
    category: 'news',
    leagues: ['la-liga'],
    refreshInterval: 15,
    priority: 8,
    active: true,
  },
  {
    id: 'mundo-deportivo',
    name: 'Mundo Deportivo',
    type: 'rss',
    url: 'https://www.mundodeportivo.com/rss/futbol',
    language: 'es',
    category: 'news',
    leagues: ['la-liga'],
    refreshInterval: 15,
    priority: 7,
    active: true,
  },
  // English sources
  {
    id: 'bbc-sport-football',
    name: 'BBC Sport Football',
    type: 'rss',
    url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
    language: 'en',
    category: 'news',
    refreshInterval: 10,
    priority: 9,
    active: true,
  },
  {
    id: 'sky-sports-football',
    name: 'Sky Sports Football',
    type: 'rss',
    url: 'https://www.skysports.com/rss/12040',
    language: 'en',
    category: 'news',
    refreshInterval: 10,
    priority: 9,
    active: true,
  },
  {
    id: 'espn-football',
    name: 'ESPN FC',
    type: 'rss',
    url: 'https://www.espn.com/espn/rss/soccer/news',
    language: 'en',
    category: 'news',
    refreshInterval: 10,
    priority: 8,
    active: true,
  },
  {
    id: 'guardian-football',
    name: 'The Guardian Football',
    type: 'rss',
    url: 'https://www.theguardian.com/football/rss',
    language: 'en',
    category: 'news',
    refreshInterval: 15,
    priority: 8,
    active: true,
  },
  // Italian
  {
    id: 'gazzetta-calcio',
    name: 'Gazzetta dello Sport',
    type: 'rss',
    url: 'https://www.gazzetta.it/rss/calcio.xml',
    language: 'it',
    category: 'news',
    leagues: ['serie-a'],
    refreshInterval: 15,
    priority: 8,
    active: true,
  },
];

const TEAM_KEYWORDS: Record<string, Record<string, string[]>> = {
  // La Liga
  'real-madrid': {
    es: ['real madrid', 'madrid', 'merengues', 'blancos', 'bernabéu', 'bernabeu', 'rmcf', 'madridista', 'florentino', 'ancelotti'],
    en: ['real madrid', 'madrid', 'los blancos', 'bernabeu', 'real'],
    // Jugadores
    players: ['vinicius', 'vini jr', 'bellingham', 'jude bellingham', 'mbappé', 'mbappe', 'kylian', 'rodrygo', 'valverde', 'fede valverde', 'modric', 'luka modric', 'courtois', 'thibaut', 'tchouaméni', 'tchouameni', 'camavinga', 'alaba', 'militao', 'eder militao', 'carvajal', 'dani carvajal', 'nacho', 'kroos', 'toni kroos', 'lunin', 'endrick', 'ceballos', 'güler', 'arda guler'],
  },
  'barcelona': {
    es: ['barcelona', 'barça', 'barca', 'blaugrana', 'culés', 'cules', 'fcb', 'camp nou', 'laporta', 'xavi', 'flick'],
    en: ['barcelona', 'barca', 'blaugrana', 'fcb', 'camp nou'],
    players: ['lamine yamal', 'yamal', 'pedri', 'gavi', 'raphinha', 'lewandowski', 'robert lewandowski', 'ter stegen', 'araujo', 'ronald araujo', 'koundé', 'kounde', 'cubarsí', 'cubarsi', 'pau cubarsi', 'de jong', 'frenkie de jong', 'ferran torres', 'dani olmo', 'fermín', 'fermin lopez', 'balde', 'alejandro balde', 'iñigo martínez', 'inigo martinez', 'christensen', 'ansu fati'],
  },
  'atletico-madrid': {
    es: ['atlético', 'atletico', 'atleti', 'colchoneros', 'rojiblanco', 'simeone', 'metropolitano'],
    en: ['atletico madrid', 'atletico', 'atleti'],
    players: ['griezmann', 'antoine griezmann', 'oblak', 'jan oblak', 'morata', 'alvaro morata', 'koke', 'marcos llorente', 'llorente', 'de paul', 'rodrigo de paul', 'giménez', 'gimenez', 'jose gimenez', 'savic', 'witsel', 'correa', 'angel correa', 'julian alvarez', 'sorloth', 'alexander sorloth', 'gallagher', 'conor gallagher', 'le normand'],
  },
  'sevilla': {
    es: ['sevilla', 'sevillista', 'nervión', 'nervion'],
    en: ['sevilla', 'sevilla fc'],
    players: ['lukébakio', 'lukebakio', 'isaac romero', 'sergio ramos', 'ramos', 'ocampos', 'navas', 'jesus navas', 'saúl', 'saul', 'nyland', 'badé', 'bade', 'ejuke'],
  },
  'real-betis': {
    es: ['betis', 'real betis', 'béticos', 'beticos', 'verdiblanco', 'villamarín'],
    en: ['real betis', 'betis'],
    players: ['isco', 'fekir', 'nabil fekir', 'ayoze pérez', 'ayoze', 'lo celso', 'giovani lo celso', 'ruibal', 'rui silva', 'marc roca', 'fornals', 'pablo fornals', 'johnny cardoso', 'abde', 'ez abde'],
  },
  'real-sociedad': {
    es: ['real sociedad', 'la real', 'txuri-urdin', 'anoeta', 'donostia'],
    en: ['real sociedad', 'la real'],
    players: ['oyarzabal', 'mikel oyarzabal', 'take kubo', 'kubo', 'barrenetxea', 'brais méndez', 'brais mendez', 'merino', 'mikel merino', 'zubimendi', 'martin zubimendi', 'remiro', 'le normand', 'aritz elustondo', 'sergio gómez'],
  },
  'athletic-bilbao': {
    es: ['athletic', 'athletic bilbao', 'athletic club', 'leones', 'san mamés'],
    en: ['athletic bilbao', 'athletic club'],
    players: ['nico williams', 'williams', 'iñaki williams', 'inaki williams', 'muniain', 'iker muniain', 'sancet', 'oihan sancet', 'vivian', 'yeray', 'unai simón', 'unai simon', 'berenguer', 'de marcos', 'guruzeta', 'gorka guruzeta', 'vesga', 'herrera'],
  },
  'villarreal': {
    es: ['villarreal', 'submarino amarillo', 'groguets'],
    en: ['villarreal', 'yellow submarine'],
    players: ['gerard moreno', 'alex baena', 'baena', 'danjuma', 'pepe reina', 'albiol', 'raul albiol', 'parejo', 'dani parejo', 'yeremy pino', 'pino', 'comesaña', 'barry', 'thierno barry', 'pedraza', 'foyth', 'juan foyth'],
  },
  'valencia': {
    es: ['valencia', 'valencia cf', 'che', 'mestalla', 'murciélagos'],
    en: ['valencia', 'valencia cf'],
    players: ['hugo duro', 'diego lópez', 'gayà', 'gaya', 'jose gaya', 'mamardashvili', 'giorgi mamardashvili', 'javi guerra', 'pepelu', 'thierry correia', 'caufriez', 'guillamon', 'hugo guillamon'],
  },
  // Premier League
  'manchester-city': {
    es: ['manchester city', 'man city', 'city', 'ciudadanos', 'citizens', 'guardiola', 'etihad'],
    en: ['manchester city', 'man city', 'city', 'citizens', 'cityzens', 'mcfc'],
    players: ['haaland', 'erling haaland', 'de bruyne', 'kevin de bruyne', 'foden', 'phil foden', 'rodri', 'rodrigo hernández', 'bernardo silva', 'bernardo', 'ederson', 'gvardiol', 'josko gvardiol', 'ruben dias', 'dias', 'stones', 'john stones', 'walker', 'kyle walker', 'grealish', 'jack grealish', 'doku', 'jeremy doku', 'kovacic', 'mateo kovacic', 'akanji', 'savinho'],
  },
  'manchester-united': {
    es: ['manchester united', 'man united', 'united', 'diablos rojos', 'old trafford'],
    en: ['manchester united', 'man united', 'united', 'red devils', 'mufc', 'man utd'],
    players: ['rashford', 'marcus rashford', 'bruno fernandes', 'bruno', 'hojlund', 'rasmus hojlund', 'garnacho', 'alejandro garnacho', 'mainoo', 'kobbie mainoo', 'casemiro', 'onana', 'andre onana', 'martinez', 'lisandro martinez', 'dalot', 'diogo dalot', 'varane', 'shaw', 'luke shaw', 'antony', 'eriksen', 'mount', 'mason mount', 'zirkzee', 'joshua zirkzee', 'ugarte', 'manuel ugarte', 'mazraoui', 'de ligt', 'matthijs de ligt'],
  },
  'liverpool': {
    es: ['liverpool', 'reds', 'anfield', 'klopp', 'slot'],
    en: ['liverpool', 'reds', 'lfc', 'anfield', 'the kop'],
    players: ['salah', 'mohamed salah', 'mo salah', 'nunez', 'darwin nunez', 'darwin', 'luis diaz', 'lucho diaz', 'diaz', 'mac allister', 'alexis mac allister', 'szoboszlai', 'dominik szoboszlai', 'alisson', 'alisson becker', 'van dijk', 'virgil van dijk', 'trent', 'alexander-arnold', 'trent alexander-arnold', 'robertson', 'andy robertson', 'konate', 'ibrahima konate', 'gakpo', 'cody gakpo', 'gravenberch', 'ryan gravenberch', 'chiesa', 'federico chiesa', 'jota', 'diogo jota', 'jones', 'curtis jones'],
  },
  'arsenal': {
    es: ['arsenal', 'gunners', 'cañoneros', 'emirates', 'arteta'],
    en: ['arsenal', 'gunners', 'afc', 'emirates'],
    players: ['saka', 'bukayo saka', 'odegaard', 'martin odegaard', 'rice', 'declan rice', 'havertz', 'kai havertz', 'martinelli', 'gabriel martinelli', 'raya', 'david raya', 'saliba', 'william saliba', 'gabriel', 'gabriel magalhaes', 'white', 'ben white', 'zinchenko', 'timber', 'jurrien timber', 'trossard', 'leandro trossard', 'jesus', 'gabriel jesus', 'nketiah', 'tomiyasu', 'partey', 'thomas partey', 'jorginho', 'calafiori'],
  },
  'chelsea': {
    es: ['chelsea', 'blues', 'stamford bridge', 'maresca'],
    en: ['chelsea', 'blues', 'cfc', 'stamford bridge'],
    players: ['palmer', 'cole palmer', 'jackson', 'nicolas jackson', 'enzo fernández', 'enzo fernandez', 'enzo', 'mudryk', 'mykhailo mudryk', 'caicedo', 'moises caicedo', 'nkunku', 'christopher nkunku', 'sterling', 'raheem sterling', 'sanchez', 'robert sanchez', 'fofana', 'wesley fofana', 'colwill', 'levi colwill', 'gusto', 'malo gusto', 'cucurella', 'marc cucurella', 'disasi', 'felix', 'joao felix', 'madueke', 'noni madueke', 'lavia', 'romeo lavia'],
  },
  'tottenham': {
    es: ['tottenham', 'spurs', 'lilywhites', 'postecoglou'],
    en: ['tottenham', 'spurs', 'thfc', 'lilywhites'],
    players: ['son', 'son heung-min', 'heung-min son', 'richarlison', 'maddison', 'james maddison', 'kulusevski', 'dejan kulusevski', 'vicario', 'guglielmo vicario', 'romero', 'cristian romero', 'van de ven', 'micky van de ven', 'udogie', 'destiny udogie', 'porro', 'pedro porro', 'bissouma', 'yves bissouma', 'bentancur', 'rodrigo bentancur', 'sarr', 'pape sarr', 'johnson', 'brennan johnson', 'solanke', 'dominic solanke', 'werner', 'timo werner'],
  },
  'newcastle': {
    es: ['newcastle', 'magpies', 'urracas', 'howe'],
    en: ['newcastle', 'magpies', 'nufc', 'toon'],
    players: ['isak', 'alexander isak', 'gordon', 'anthony gordon', 'bruno guimaraes', 'bruno guimarães', 'schar', 'fabian schar', 'trippier', 'kieran trippier', 'pope', 'nick pope', 'botman', 'sven botman', 'tonali', 'sandro tonali', 'joelinton', 'barnes', 'harvey barnes', 'wilson', 'callum wilson', 'longstaff', 'sean longstaff', 'hall', 'lewis hall', 'livramento', 'tino livramento'],
  },
  'aston-villa': {
    es: ['aston villa', 'villa', 'villans', 'emery', 'unai emery'],
    en: ['aston villa', 'villa', 'avfc', 'villans'],
    players: ['watkins', 'ollie watkins', 'martinez', 'emi martinez', 'emiliano martinez', 'mcginn', 'john mcginn', 'douglas luiz', 'cash', 'matty cash', 'konsa', 'ezri konsa', 'digne', 'lucas digne', 'tielemans', 'youri tielemans', 'bailey', 'leon bailey', 'kamara', 'boubacar kamara', 'pau torres', 'diaby', 'moussa diaby', 'duran', 'jhon duran', 'rogers', 'morgan rogers', 'ramsey', 'jacob ramsey'],
  },
  // Serie A
  'juventus': {
    es: ['juventus', 'juve', 'vecchia signora', 'bianconeri', 'turín', 'thiago motta'],
    en: ['juventus', 'juve', 'old lady', 'bianconeri'],
    players: ['vlahovic', 'dusan vlahovic', 'chiesa', 'federico chiesa', 'di maria', 'angel di maria', 'locatelli', 'manuel locatelli', 'rabiot', 'adrien rabiot', 'bremer', 'gleison bremer', 'danilo', 'kostic', 'filip kostic', 'gatti', 'federico gatti', 'szczesny', 'wojciech szczesny', 'milik', 'arkadiusz milik', 'cambiaso', 'andrea cambiaso', 'weah', 'timothy weah', 'yildiz', 'kenan yildiz', 'koopmeiners', 'teun koopmeiners', 'nico gonzalez', 'douglas luiz', 'conceicao', 'francisco conceicao'],
  },
  'inter-milan': {
    es: ['inter', 'inter de milán', 'nerazzurri', 'internazionale', 'inzaghi'],
    en: ['inter milan', 'inter', 'nerazzurri', 'internazionale'],
    players: ['lautaro', 'lautaro martinez', 'thuram', 'marcus thuram', 'barella', 'nicolo barella', 'calhanoglu', 'hakan calhanoglu', 'bastoni', 'alessandro bastoni', 'dimarco', 'federico dimarco', 'sommer', 'yann sommer', 'dumfries', 'denzel dumfries', 'mkhitaryan', 'henrikh mkhitaryan', 'acerbi', 'francesco acerbi', 'darmian', 'matteo darmian', 'arnautovic', 'marko arnautovic', 'frattesi', 'davide frattesi', 'pavard', 'benjamin pavard'],
  },
  'ac-milan': {
    es: ['milan', 'ac milan', 'rossoneri', 'san siro', 'pioli', 'fonseca'],
    en: ['ac milan', 'milan', 'rossoneri'],
    players: ['leao', 'rafael leao', 'giroud', 'olivier giroud', 'theo hernandez', 'theo', 'tomori', 'fikayo tomori', 'maignan', 'mike maignan', 'bennacer', 'ismael bennacer', 'reijnders', 'tijjani reijnders', 'pulisic', 'christian pulisic', 'loftus-cheek', 'ruben loftus-cheek', 'okafor', 'noah okafor', 'calabria', 'davide calabria', 'thiaw', 'malick thiaw', 'musah', 'yunus musah', 'chukwueze', 'samuel chukwueze', 'morata', 'alvaro morata'],
  },
  'napoli': {
    es: ['napoli', 'nápoles', 'partenopei', 'azzurri', 'conte', 'antonio conte'],
    en: ['napoli', 'partenopei'],
    players: ['osimhen', 'victor osimhen', 'kvara', 'kvaratskhelia', 'khvicha kvaratskhelia', 'di lorenzo', 'giovanni di lorenzo', 'lobotka', 'stanislav lobotka', 'anguissa', 'zambo anguissa', 'meret', 'alex meret', 'kim min-jae', 'min-jae', 'rrahmani', 'amir rrahmani', 'politano', 'matteo politano', 'raspadori', 'giacomo raspadori', 'zielinski', 'piotr zielinski', 'simeone', 'giovanni simeone', 'lukaku', 'romelu lukaku', 'mctominay', 'scott mctominay', 'neres', 'david neres'],
  },
  'roma': {
    es: ['roma', 'as roma', 'giallorossi', 'lobos', 'de rossi'],
    en: ['roma', 'as roma', 'giallorossi'],
    players: ['dybala', 'paulo dybala', 'lukaku', 'romelu lukaku', 'pellegrini', 'lorenzo pellegrini', 'paredes', 'leandro paredes', 'mancini', 'gianluca mancini', 'smalling', 'chris smalling', 'svilar', 'mile svilar', 'abraham', 'tammy abraham', 'spinazzola', 'leonardo spinazzola', 'cristante', 'bryan cristante', 'el shaarawy', 'stephan el shaarawy', 'zalewski', 'nicola zalewski', 'dovbyk', 'artem dovbyk', 'soulé', 'soule', 'matias soule'],
  },
  'lazio': {
    es: ['lazio', 'biancocelesti', 'águilas', 'sarri', 'baroni'],
    en: ['lazio', 'biancocelesti'],
    players: ['immobile', 'ciro immobile', 'felipe anderson', 'luis alberto', 'milinkovic-savic', 'sergej milinkovic-savic', 'provedel', 'ivan provedel', 'romagnoli', 'alessio romagnoli', 'casale', 'nicolo casale', 'guendouzi', 'matteo guendouzi', 'kamada', 'daichi kamada', 'pedro', 'pedro rodriguez', 'cataldi', 'danilo cataldi', 'marusic', 'adam marusic', 'castellanos', 'taty castellanos', 'zaccagni', 'mattia zaccagni', 'dia', 'boulaye dia'],
  },
  // Bundesliga
  'bayern-munich': {
    es: ['bayern', 'bayern múnich', 'bayern munich', 'bávaros', 'kompany', 'vincent kompany'],
    en: ['bayern munich', 'bayern', 'bavarians', 'fcb'],
    players: ['kane', 'harry kane', 'sane', 'leroy sane', 'musiala', 'jamal musiala', 'kimmich', 'joshua kimmich', 'neuer', 'manuel neuer', 'müller', 'muller', 'thomas müller', 'goretzka', 'leon goretzka', 'davies', 'alphonso davies', 'upamecano', 'dayot upamecano', 'de ligt', 'matthijs de ligt', 'coman', 'kingsley coman', 'gnabry', 'serge gnabry', 'tel', 'mathys tel', 'laimer', 'konrad laimer', 'kim min-jae', 'guerreiro', 'raphael guerreiro', 'olise', 'michael olise', 'palhinha', 'joao palhinha'],
  },
  'borussia-dortmund': {
    es: ['dortmund', 'borussia dortmund', 'bvb', 'negriamarillos', 'sahin', 'nuri sahin'],
    en: ['borussia dortmund', 'dortmund', 'bvb'],
    players: ['sancho', 'jadon sancho', 'reus', 'marco reus', 'brandt', 'julian brandt', 'fullkrug', 'niclas fullkrug', 'hummels', 'mats hummels', 'adeyemi', 'karim adeyemi', 'sabitzer', 'marcel sabitzer', 'schlotterbeck', 'nico schlotterbeck', 'kobel', 'gregor kobel', 'ryerson', 'julian ryerson', 'malen', 'donyell malen', 'can', 'emre can', 'nmecha', 'felix nmecha', 'bynoe-gittens', 'jamie bynoe-gittens', 'guirassy', 'serhou guirassy', 'groß', 'gross', 'pascal gross', 'beier', 'maximilian beier'],
  },
  'rb-leipzig': {
    es: ['leipzig', 'rb leipzig', 'red bull', 'rose', 'marco rose'],
    en: ['rb leipzig', 'leipzig'],
    players: ['nkunku', 'christopher nkunku', 'olmo', 'dani olmo', 'openda', 'lois openda', 'xavi simons', 'simons', 'gvardiol', 'josko gvardiol', 'orban', 'willi orban', 'gulacsi', 'peter gulacsi', 'kampl', 'kevin kampl', 'haidara', 'amadou haidara', 'raum', 'david raum', 'sesko', 'benjamin sesko', 'baumgartner', 'christoph baumgartner'],
  },
  'bayer-leverkusen': {
    es: ['leverkusen', 'bayer leverkusen', 'xabi alonso'],
    en: ['bayer leverkusen', 'leverkusen'],
    players: ['wirtz', 'florian wirtz', 'schick', 'patrik schick', 'diaby', 'moussa diaby', 'frimpong', 'jeremie frimpong', 'tapsoba', 'edmond tapsoba', 'hradecky', 'lukas hradecky', 'grimaldo', 'alejandro grimaldo', 'andrich', 'robert andrich', 'hofmann', 'jonas hofmann', 'tah', 'jonathan tah', 'palacios', 'exequiel palacios', 'xhaka', 'granit xhaka', 'boniface', 'victor boniface', 'adli', 'amine adli', 'terrier', 'martin terrier', 'garcia', 'aleix garcia'],
  },
  // Ligue 1
  'psg': {
    es: ['psg', 'paris saint-germain', 'paris', 'parisinos', 'luis enrique'],
    en: ['psg', 'paris saint-germain', 'paris'],
    players: ['mbappe', 'kylian mbappe', 'dembele', 'ousmane dembele', 'hakimi', 'achraf hakimi', 'marquinhos', 'donnarumma', 'gianluigi donnarumma', 'vitinha', 'ruiz', 'fabian ruiz', 'kolo muani', 'randal kolo muani', 'ugarte', 'manuel ugarte', 'ramos', 'sergio ramos', 'skriniar', 'milan skriniar', 'asensio', 'marco asensio', 'lee kang-in', 'kang-in lee', 'barcola', 'bradley barcola', 'zaïre-emery', 'zaire-emery', 'warren zaire-emery', 'neves', 'joao neves'],
  },
  'marseille': {
    es: ['marsella', 'olympique marsella', 'om', 'de zerbi'],
    en: ['marseille', 'om', 'olympique marseille'],
    players: ['aubameyang', 'pierre-emerick aubameyang', 'sanchez', 'alexis sanchez', 'clauss', 'jonathan clauss', 'rongier', 'valentin rongier', 'balerdi', 'leonardo balerdi', 'mbemba', 'chancel mbemba', 'lopez', 'pau lopez', 'harit', 'amine harit', 'kondogbia', 'geoffrey kondogbia', 'ndiaye', 'iliman ndiaye', 'greenwood', 'mason greenwood'],
  },
  'lyon': {
    es: ['lyon', 'olympique lyon', 'ol'],
    en: ['lyon', 'olympique lyonnais'],
    players: ['lacazette', 'alexandre lacazette', 'cherki', 'rayan cherki', 'caqueret', 'maxence caqueret', 'tolisso', 'corentin tolisso', 'lopes', 'anthony lopes', 'tagliafico', 'nicolas tagliafico', 'nuamah', 'ernest nuamah', 'mikautadze', 'georges mikautadze'],
  },
  'monaco': {
    es: ['mónaco', 'monaco', 'as monaco', 'hütter'],
    en: ['monaco', 'as monaco'],
    players: ['ben yedder', 'wissam ben yedder', 'golovin', 'aleksandr golovin', 'tchouameni', 'aurelien tchouameni', 'embolo', 'breel embolo', 'fofana', 'youssouf fofana', 'badiashile', 'benoit badiashile', 'nubel', 'alexander nubel', 'zakaria', 'denis zakaria', 'minamino', 'takumi minamino', 'balogun', 'folarin balogun', 'akliouche', 'maghnes akliouche'],
  },
  // Liga MX
  'america': {
    es: ['américa', 'america', 'club américa', 'las águilas', 'aguilas', 'coapa', 'azulcremas', 'jardine'],
    en: ['club america', 'america'],
    players: ['henry martin', 'henry martín', 'richard sanchez', 'richard sánchez', 'diego valdes', 'diego valdés', 'alvaro fidalgo', 'álvaro fidalgo', 'luis fuentes', 'jorge sanchez', 'jorge sánchez', 'quiñones', 'quinones', 'jonathan rodriguez', 'jonathan rodríguez', 'brian rodriguez', 'brian rodríguez', 'rodrigo aguirre'],
  },
  'chivas': {
    es: ['chivas', 'guadalajara', 'chivas guadalajara', 'rebaño', 'rojiblanco', 'akron', 'gago', 'fernando gago'],
    en: ['chivas', 'guadalajara'],
    players: ['chicharito', 'javier hernandez', 'javier hernández', 'alexis vega', 'fernando beltran', 'fernando beltrán', 'gilberto sepulveda', 'gilberto sepúlveda', 'roberto alvarado', 'piojo alvarado', 'cade cowell', 'mozo', 'pável pérez', 'pavel perez', 'chiquete', 'jesús orozco', 'jesus orozco', 'cisneros', 'ricardo marin'],
  },
  'cruz-azul': {
    es: ['cruz azul', 'la máquina', 'maquina', 'cementeros', 'azul', 'anselmi'],
    en: ['cruz azul'],
    players: ['martin anselmi', 'uriel antuna', 'carlos rotondi', 'angel romero', 'ángel romero', 'ignacio rivero', 'luis romo', 'erik lira', 'rodolfo rotondi', 'kevin mier', 'gonzalo piovi', 'giorgos giakoumakis', 'lorenzo faravelli'],
  },
  'tigres': {
    es: ['tigres', 'tigres uanl', 'felinos', 'universitario', 'piojo', 'herrera', 'miguel herrera'],
    en: ['tigres', 'tigres uanl'],
    players: ['gignac', 'andre-pierre gignac', 'thauvin', 'florian thauvin', 'vigon', 'vigón', 'juan vigon', 'nahuel guzman', 'nahuel guzmán', 'pizarro', 'rodolfo pizarro', 'aquino', 'javier aquino', 'quinones', 'quiñones', 'luis quinones', 'samir', 'guido pizarro', 'rafael carioca', 'diego reyes', 'sebastian cordova', 'sebastián córdova'],
  },
  'monterrey': {
    es: ['monterrey', 'rayados', 'pandilla', 'la pandilla', 'demichelis', 'martin demichelis'],
    en: ['monterrey', 'rayados'],
    players: ['funes mori', 'rogelio funes mori', 'berterame', 'german berterame', 'germán berterame', 'canales', 'jesus gallardo', 'jesús gallardo', 'meza', 'maxi meza', 'maximiliano meza', 'vegas', 'esteban andrada', 'sergio canales', 'oliver torres', 'hector moreno', 'héctor moreno', 'johan rojas', 'jorge rodriguez'],
  },
  'pumas-unam': {
    es: ['pumas', 'pumas unam', 'universitarios', 'cu', 'ciudad universitaria', 'lema', 'gustavo lema'],
    en: ['pumas', 'pumas unam'],
    players: ['dani alves', 'julio gonzalez', 'arturo ortiz', 'cesar huerta', 'césar huerta', 'guillermo martinez', 'guillermo martínez', 'pablo bennevendo', 'jorge ruvalcaba', 'piero quispe', 'ali avila', 'alí ávila', 'robert ergas', 'nathan silva'],
  },
  'santos-laguna': {
    es: ['santos', 'santos laguna', 'guerreros', 'laguneros'],
    en: ['santos laguna'],
    players: ['acevedo', 'carlos acevedo', 'harold preciado', 'jordan carrillo', 'omar campos', 'fernando gorriaran', 'fernando gorriarán', 'leonardo suarez', 'leonardo suárez', 'juan brunetta'],
  },
  'leon': {
    es: ['león', 'leon', 'club león', 'esmeraldas', 'la fiera', 'renato paiva'],
    en: ['leon', 'club leon'],
    players: ['lucas di yorio', 'stiven barreiro', 'andres mosquera', 'andrés mosquera', 'elias hernandez', 'elías hernández', 'fidel ambriz', 'adonis frias', 'adonis frías', 'alfonso blanco'],
  },
  'toluca': {
    es: ['toluca', 'diablos rojos', 'choriceros', 'renato paiva'],
    en: ['toluca'],
    players: ['kevin castañeda', 'kevin castaneda', 'jesus angulo', 'jesús angulo', 'marcel ruiz', 'tiago volpi', 'alexis canelo', 'leo fernandez', 'leo fernández', 'jean meneses', 'brian garcia', 'brian garcía'],
  },
  'pachuca': {
    es: ['pachuca', 'tuzos', 'tuzo', 'almada'],
    en: ['pachuca', 'tuzos'],
    players: ['salomon rondon', 'salomón rondón', 'nicolas ibañez', 'nicolás ibáñez', 'arturo gonzalez', 'arturo gonzález', 'oussama idrissi', 'carlos moreno', 'bryan gonzalez', 'bryan gonzález', 'marino hinestroza', 'nelson deossa', 'israel reyes'],
  },
  // Argentina
  'river-plate': {
    es: ['river', 'river plate', 'millonarios', 'el monumental', 'núñez', 'demichelis', 'gallardo'],
    en: ['river plate', 'river'],
    players: ['borja', 'miguel borja', 'de la cruz', 'nicolas de la cruz', 'fernandez', 'enzo fernandez', 'solari', 'pablo solari', 'martinez quarta', 'german pezzella', 'armani', 'franco armani', 'diaz', 'nacho fernandez', 'barco', 'esequiel barco', 'colidio', 'facundo colidio', 'aliendro', 'rodrigo aliendro', 'kranevitter', 'mastantuono', 'claudio echeverri'],
  },
  'boca-juniors': {
    es: ['boca', 'boca juniors', 'xeneizes', 'la bombonera', 'azul y oro', 'gago'],
    en: ['boca juniors', 'boca'],
    players: ['cavani', 'edinson cavani', 'merentiel', 'miguel merentiel', 'zeballos', 'exequiel zeballos', 'romero', 'sergio romero', 'rojo', 'marcos rojo', 'fernandez', 'pol fernandez', 'medina', 'cristian medina', 'advíncula', 'advincula', 'luis advincula', 'saralegui', 'equi fernandez', 'equi fernández', 'anselmino', 'aaron anselmino', 'kevin zenon', 'kevin zenón', 'blondel', 'lucas blondel'],
  },
  // Brazil
  'flamengo': {
    es: ['flamengo', 'mengão', 'rubro-negro', 'fla', 'filipe luis'],
    en: ['flamengo', 'fla'],
    players: ['gabigol', 'gabriel barbosa', 'pedro', 'arrascaeta', 'giorgian de arrascaeta', 'everton ribeiro', 'gerson', 'bruno henrique', 'david luiz', 'filipe luis', 'santos', 'wesley', 'matheuzinho', 'ayrton lucas', 'varela', 'guillermo varela', 'pulgar', 'erick pulgar', 'de la cruz', 'nicolas de la cruz', 'luiz araujo'],
  },
  'palmeiras': {
    es: ['palmeiras', 'verdão', 'porco', 'alviverde', 'abel ferreira'],
    en: ['palmeiras'],
    players: ['endrick', 'dudu', 'rony', 'raphael veiga', 'veiga', 'gustavo gomez', 'weverton', 'zé rafael', 'ze rafael', 'piquerez', 'rocha', 'murilo', 'richard rios', 'richard ríos', 'aníbal moreno', 'anibal moreno', 'flaco lopez', 'lopez', 'estevao', 'estêvão'],
  },
  'corinthians': {
    es: ['corinthians', 'timão', 'corintiano', 'mano menezes'],
    en: ['corinthians'],
    players: ['cassio', 'cássio', 'yuri alberto', 'renato augusto', 'fagner', 'fausto vera', 'garro', 'rodrigo garro', 'rojas', 'hugo', 'depay', 'memphis depay', 'carrillo', 'andre carrillo', 'charles', 'felix torres', 'félix torres', 'coronado', 'angel romero', 'ángel romero'],
  },
  // Women's teams
  'barcelona-femeni': {
    es: ['barcelona femenino', 'barça femenino', 'barça femení', 'barcelona femeni'],
    en: ['barcelona women', 'barca women', 'barcelona femeni'],
    players: ['alexia putellas', 'alexia', 'aitana bonmati', 'aitana bonmatí', 'aitana', 'salma paralluelo', 'paralluelo', 'caroline graham hansen', 'graham hansen', 'mapi leon', 'mapi león', 'sandra panos', 'sandra paños', 'patri guijarro', 'fridolina rolfo', 'rolfo', 'claudia pina', 'mariona caldentey', 'ona batlle', 'irene paredes', 'lucy bronze'],
  },
  'real-madrid-femenino': {
    es: ['real madrid femenino', 'madrid femenino', 'real madrid women'],
    en: ['real madrid women', 'madrid women'],
    players: ['caroline weir', 'weir', 'esther gonzalez', 'esther gonzález', 'athenea del castillo', 'athenea', 'olga carmona', 'carmona', 'misa rodriguez', 'misa rodríguez', 'misa', 'teresa abelleira', 'nahikari garcia', 'nahikari garcía', 'linda caicedo', 'caicedo'],
  },
  'chelsea-women': {
    es: ['chelsea femenino', 'chelsea women'],
    en: ['chelsea women', 'chelsea fc women', 'chelsea ladies'],
    players: ['sam kerr', 'kerr', 'millie bright', 'fran kirby', 'kirby', 'erin cuthbert', 'guro reiten', 'reiten', 'eve perisset', 'kadeisha buchanan', 'buchanan', 'lauren james', 'mayra ramirez'],
  },
  'arsenal-women': {
    es: ['arsenal femenino', 'arsenal women'],
    en: ['arsenal women', 'arsenal wfc', 'arsenal ladies'],
    players: ['vivianne miedema', 'miedema', 'beth mead', 'mead', 'leah williamson', 'williamson', 'katie mccabe', 'mccabe', 'alessia russo', 'russo', 'stina blackstenius', 'blackstenius', 'kyra cooney-cross', 'manuela zinsberger', 'kim little'],
  },
  'lyon-feminin': {
    es: ['lyon femenino', 'olympique lyon femenino'],
    en: ['lyon women', 'olympique lyonnais women'],
    fr: ['ol féminin', 'lyon féminin'],
    players: ['ada hegerberg', 'hegerberg', 'eugenie le sommer', 'le sommer', 'wendie renard', 'renard', 'catarina macario', 'macario', 'delphine cascarino', 'cascarino', 'lindsey horan', 'horan', 'christiane endler', 'endler'],
  },
  'america-femenil': {
    es: ['américa femenil', 'america femenil', 'águilas femenil'],
    en: ['club america women'],
    players: ['katty martinez', 'katty martínez', 'sarah luebbert', 'scarlett camberos', 'jana gutierrez', 'jana gutiérrez', 'daniela espinosa', 'kiana palacios'],
  },
  'chivas-femenil': {
    es: ['chivas femenil', 'guadalajara femenil', 'rebaño femenil'],
    en: ['chivas women'],
    players: ['alicia cervantes', 'licha cervantes', 'carolina jaramillo', 'joseline montoya', 'kinberly guzman', 'kinberly guzmán', 'casandra montero', 'michelle gonzalez', 'michelle gonzález'],
  },
  'tigres-femenil': {
    es: ['tigres femenil', 'amazonas', 'tigres uanl femenil'],
    en: ['tigres women'],
    players: ['stephany mayor', 'jennifer hermoso', 'jenni hermoso', 'bianca sierra', 'nayeli rangel', 'lizbeth ovalle', 'maria sanchez', 'maría sánchez', 'belén cruz', 'belen cruz', 'natalia villarreal'],
  },
};

const TYPE_INDICATORS: Record<ContentType, string[]> = {
  [ContentType.BREAKING]: ['breaking', 'última hora', 'urgente', 'just in', 'alert', 'official', 'confirmed', 'breaking news'],
  [ContentType.MATCHDAY]: ['match', 'partido', 'lineup', 'alineación', 'kick off', 'vs', 'preview', 'previa'],
  [ContentType.RESULT]: ['result', 'resultado', 'final score', 'gol', 'goal', 'victoria', 'derrota', 'empate', 'win', 'loss', 'draw'],
  [ContentType.TRANSFER]: ['transfer', 'fichaje', 'signing', 'deal', 'contract', 'bid', 'offer', 'target', 'linked'],
  [ContentType.INJURY]: ['injury', 'lesión', 'injured', 'ruled out', 'sidelined', 'fitness', 'surgery', 'recuperación'],
  [ContentType.STATS]: ['stats', 'estadísticas', 'record', 'récord', 'numbers', 'data', 'histórico'],
  [ContentType.QUOTE]: ['says', 'dice', 'declaraciones', 'interview', 'entrevista', 'claims', 'afirma', 'reveals'],
  [ContentType.MEME]: ['meme', 'viral', 'funny', 'gracioso', 'humor'],
  [ContentType.THROWBACK]: ['throwback', 'on this day', 'tal día', 'anniversary', 'aniversario', 'años', 'years ago'],
  [ContentType.RUMOR]: ['rumor', 'rumour', 'reportedly', 'según', 'podría', 'could', 'might', 'speculation'],
  [ContentType.GENERAL]: [],
};

const TYPE_TO_TEMPLATES: Record<ContentType, string[]> = {
  [ContentType.BREAKING]: ['preset-ultima-hora-pro', 'preset-breaking-sidebar', 'preset-breaking-minimal', 'preset-bomba-pro'],
  [ContentType.MATCHDAY]: ['preset-match-day-pro', 'preset-match-day-sidebar', 'preset-match-day-minimal', 'preset-match-day-countdown'],
  [ContentType.RESULT]: ['preset-resultado-pro', 'preset-resultado-minimal', 'preset-resultado-editorial', 'preset-resultado-scoreboard'],
  [ContentType.TRANSFER]: ['preset-fichaje-pro', 'preset-fichaje-centered', 'preset-fichaje-minimal', 'preset-fichaje-diagonal'],
  [ContentType.INJURY]: ['preset-ultima-hora-pro', 'preset-breaking-minimal'],
  [ContentType.STATS]: ['preset-stats-pro', 'preset-stats-cards', 'preset-stats-horizontal'],
  [ContentType.QUOTE]: ['preset-cita-pro', 'preset-cita-doble-pro', 'preset-cita-minimal', 'preset-cita-sidebar'],
  [ContentType.MEME]: ['preset-meme-pro', 'preset-meme-minimal'],
  [ContentType.THROWBACK]: ['preset-throwback-pro', 'preset-throwback-film', 'preset-throwback-polaroid'],
  [ContentType.RUMOR]: ['preset-fichaje-pro', 'preset-ultima-hora-pro'],
  [ContentType.GENERAL]: ['preset-ultima-hora-pro', 'preset-breaking-minimal'],
};

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(private readonly configService: ConfigService) {}

  // --------------------------------------------------------------------------
  // Main fetch method
  // --------------------------------------------------------------------------

  async fetchContent(input: FetchContentInput): Promise<ContentSuggestionsResponse> {
    const {
      pageType = 'single-team',
      teamId,
      teamIds = [],
      leagueId,
      sourceLanguages = ['es', 'en'],
      limit = 25,
    } = input;

    try {
      let rawContent: RawContentItem[];
      let teamKeywords: string[] = [];

      // Fetch content based on page type
      switch (pageType) {
        case 'single-team':
          if (!teamId) {
            return this.errorResponse('teamId is required for single-team page type', pageType as PageType);
          }
          teamKeywords = this.getTeamKeywords(teamId);
          rawContent = await this.fetchContentForTeam(teamId, leagueId, sourceLanguages);
          break;

        case 'league':
          if (!leagueId) {
            return this.errorResponse('leagueId is required for league page type', pageType as PageType);
          }
          rawContent = await this.fetchContentForLeague(leagueId, sourceLanguages);
          break;

        case 'multi-team':
        case 'womens':
          if (!teamIds || teamIds.length === 0) {
            return this.errorResponse('teamIds is required for multi-team/womens page type', pageType as PageType);
          }
          teamKeywords = teamIds.flatMap(id => this.getTeamKeywords(id));
          rawContent = await this.fetchContentForTeams(teamIds, sourceLanguages);
          break;

        case 'general':
          rawContent = await this.fetchGeneralContent(sourceLanguages);
          break;

        default:
          return this.errorResponse(`Unknown page type: ${pageType}`, PageType.SINGLE_TEAM);
      }

      // Process content
      const contextTeamId = teamId || teamIds[0] || '';
      const processedContent = this.processContent(rawContent, contextTeamId, teamKeywords);

      // Convert to ContentSuggestion format
      const suggestions = processedContent.slice(0, limit).map(item => this.toContentSuggestion(item));

      // Calculate stats
      const urgentCount = suggestions.filter(c => c.priority === ContentPriority.URGENT).length;
      const highPriorityCount = suggestions.filter(c => c.priority === ContentPriority.HIGH).length;

      return {
        success: true,
        content: suggestions,
        meta: {
          pageType: pageType as PageType,
          teamId,
          teamIds: teamIds.length > 0 ? teamIds : undefined,
          leagueId,
          totalItems: suggestions.length,
          urgentCount,
          highPriorityCount,
          fetchedAt: new Date(),
        },
      };
    } catch (error) {
      this.logger.error('Error fetching content:', error);
      return this.errorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        (input.pageType as PageType) || PageType.SINGLE_TEAM,
      );
    }
  }

  // --------------------------------------------------------------------------
  // Content fetching methods
  // --------------------------------------------------------------------------

  private async fetchContentForTeam(
    teamId: string,
    leagueId: string | undefined,
    sourceLanguages: string[],
  ): Promise<RawContentItem[]> {
    const sources = this.getSourcesByLanguage(sourceLanguages);
    const allContent = await this.fetchFromSources(sources);
    const teamContent = this.filterByTeam(allContent, teamId);
    return this.deduplicateContent(teamContent).slice(0, 30);
  }

  private async fetchContentForTeams(
    teamIds: string[],
    sourceLanguages: string[],
  ): Promise<RawContentItem[]> {
    const sources = this.getSourcesByLanguage(sourceLanguages);
    const allContent = await this.fetchFromSources(sources);
    const teamContent = this.filterByTeams(allContent, teamIds);
    return this.deduplicateContent(teamContent).slice(0, 40);
  }

  private async fetchContentForLeague(
    leagueId: string,
    sourceLanguages: string[],
  ): Promise<RawContentItem[]> {
    const leagueSources = this.getSourcesForLeague(leagueId);
    const filteredSources = leagueSources.filter(s =>
      sourceLanguages.length === 0 || sourceLanguages.includes(s.language),
    );
    const generalSources = this.getSourcesByLanguage(sourceLanguages).filter(
      s => !s.leagues || s.leagues.length === 0,
    );
    const allSources = [...new Map([...filteredSources, ...generalSources].map(s => [s.id, s])).values()];
    const allContent = await this.fetchFromSources(allSources);
    return this.deduplicateContent(allContent).slice(0, 40);
  }

  private async fetchGeneralContent(sourceLanguages: string[]): Promise<RawContentItem[]> {
    const sources = this.getSourcesByLanguage(sourceLanguages);
    const allContent = await this.fetchFromSources(sources, { maxPerSource: 10, maxAge: 24 });
    return this.deduplicateContent(allContent).slice(0, 50);
  }

  // --------------------------------------------------------------------------
  // RSS Fetching
  // --------------------------------------------------------------------------

  private async fetchFromSources(
    sources: ContentSource[],
    options?: { maxPerSource?: number; maxAge?: number },
  ): Promise<RawContentItem[]> {
    const maxPerSource = options?.maxPerSource || 15;
    const maxAge = options?.maxAge || 48;
    const cutoffDate = new Date(Date.now() - maxAge * 60 * 60 * 1000);

    const fetchPromises = sources.map(source => this.fetchRSSFeed(source));
    const results = await Promise.all(fetchPromises);

    let allItems: RawContentItem[] = [];
    results.forEach(items => {
      const filteredItems = items
        .filter(item => item.pubDate >= cutoffDate)
        .slice(0, maxPerSource);
      allItems.push(...filteredItems);
    });

    allItems.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
    return allItems;
  }

  private async fetchRSSFeed(source: ContentSource): Promise<RawContentItem[]> {
    try {
      const response = await fetch(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FutbolifyBot/1.0)',
          Accept: 'application/rss+xml, application/xml, text/xml, */*',
        },
      });

      if (!response.ok) {
        this.logger.warn(`Failed to fetch ${source.name}: ${response.status}`);
        return [];
      }

      const xml = await response.text();
      const itemMatches = xml.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];

      const items: RawContentItem[] = [];
      for (const itemXml of itemMatches) {
        const item = this.parseRSSItem(itemXml, source.id, source.name, source.language);
        if (item) {
          items.push(item);
        }
      }

      return items;
    } catch (error) {
      this.logger.error(`Error fetching ${source.name}:`, error);
      return [];
    }
  }

  private parseRSSItem(
    itemXml: string,
    sourceId: string,
    sourceName: string,
    sourceLanguage: string,
  ): RawContentItem | null {
    try {
      const titleMatch = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      let title = titleMatch ? titleMatch[1].trim() : '';
      title = this.decodeHTMLEntities(title);
      title = title.replace(/<[^>]*>/g, '').trim();

      const descMatch = itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
      let description = descMatch ? descMatch[1].trim() : '';
      description = this.decodeHTMLEntities(description);
      description = description.replace(/<[^>]*>/g, '').trim();
      if (description.length > 500) {
        description = description.substring(0, 500) + '...';
      }

      const linkMatch = itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
      const link = linkMatch ? linkMatch[1].trim() : '';

      const dateMatch = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
      const pubDate = dateMatch ? new Date(dateMatch[1].trim()) : new Date();

      let imageUrl: string | undefined;
      const enclosureMatch = itemXml.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image/i);
      if (enclosureMatch) {
        imageUrl = enclosureMatch[1];
      } else {
        const mediaMatch = itemXml.match(/<media:content[^>]*url=["']([^"']+)["']/i);
        if (mediaMatch) {
          imageUrl = mediaMatch[1];
        } else {
          const imgMatch = itemXml.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i);
          if (imgMatch) {
            imageUrl = imgMatch[1];
          }
        }
      }

      if (!title || !link) {
        return null;
      }

      const linkHash = Buffer.from(link).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);
      const dateHash = pubDate.getTime().toString(36);

      return {
        id: `${sourceId}-${linkHash}-${dateHash}`,
        sourceId,
        sourceName,
        sourceLanguage,
        title,
        description,
        link,
        pubDate,
        imageUrl,
      };
    } catch (error) {
      this.logger.error('Error parsing RSS item:', error);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Content Processing
  // --------------------------------------------------------------------------

  private processContent(
    items: RawContentItem[],
    teamId: string,
    teamKeywords: string[],
  ): ProcessedContent[] {
    return items.map(item => {
      const type = this.detectContentType(item.title, item.description);
      const priority = this.calculatePriority(item, type);
      const relevanceScore = this.calculateRelevanceScore(item, teamKeywords);
      const suggestedTemplates = TYPE_TO_TEMPLATES[type] || TYPE_TO_TEMPLATES[ContentType.GENERAL];
      const hashtags = this.generateHashtags(item, teamId);
      const suggestedCaption = this.generateCaption(item, type);

      return {
        id: item.id,
        type,
        priority,
        title: item.title,
        description: item.description,
        source: item.sourceName,
        sourceUrl: item.link,
        originalLanguage: item.sourceLanguage,
        imageUrl: item.imageUrl,
        pubDate: item.pubDate,
        suggestedTemplates,
        suggestedCaption,
        hashtags,
        relevanceScore,
      };
    });
  }

  private detectContentType(title: string, description: string): ContentType {
    const text = `${title} ${description}`.toLowerCase();

    for (const [type, keywords] of Object.entries(TYPE_INDICATORS)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return type as ContentType;
      }
    }

    return ContentType.GENERAL;
  }

  private calculatePriority(item: RawContentItem, type: ContentType): ContentPriority {
    const ageInHours = (Date.now() - item.pubDate.getTime()) / (1000 * 60 * 60);

    if (type === ContentType.BREAKING && ageInHours < 2) {
      return ContentPriority.URGENT;
    }

    if (
      (type === ContentType.RESULT && ageInHours < 6) ||
      type === ContentType.TRANSFER
    ) {
      return ContentPriority.HIGH;
    }

    if (ageInHours > 24) {
      return ContentPriority.LOW;
    }

    return ContentPriority.NORMAL;
  }

  private calculateRelevanceScore(item: RawContentItem, teamKeywords: string[]): number {
    if (teamKeywords.length === 0) return 50;

    const title = item.title.toLowerCase();
    const description = item.description.toLowerCase();
    let score = 0;

    for (const keyword of teamKeywords) {
      if (title.includes(keyword.toLowerCase())) {
        score += 30;
      }
      if (description.includes(keyword.toLowerCase())) {
        score += 15;
      }
    }

    return Math.min(score, 100);
  }

  private generateHashtags(item: RawContentItem, teamId: string): string[] {
    const hashtags: string[] = [];

    if (teamId) {
      const teamName = teamId.replace(/-/g, '');
      hashtags.push(`#${teamName}`);
    }

    hashtags.push('#futbol', '#football');

    return hashtags;
  }

  private generateCaption(item: RawContentItem, type: ContentType): string {
    const emoji = this.getTypeEmoji(type);
    return `${emoji} ${item.title}\n\n${item.description.substring(0, 200)}...`;
  }

  private getTypeEmoji(type: ContentType): string {
    const emojis: Record<ContentType, string> = {
      [ContentType.BREAKING]: '🚨',
      [ContentType.MATCHDAY]: '📅',
      [ContentType.RESULT]: '⚽',
      [ContentType.TRANSFER]: '✨',
      [ContentType.INJURY]: '🏥',
      [ContentType.STATS]: '📊',
      [ContentType.QUOTE]: '💬',
      [ContentType.MEME]: '😂',
      [ContentType.THROWBACK]: '📸',
      [ContentType.RUMOR]: '👀',
      [ContentType.GENERAL]: '📰',
    };
    return emojis[type] || '📰';
  }

  // --------------------------------------------------------------------------
  // Filtering
  // --------------------------------------------------------------------------

  private filterByTeam(items: RawContentItem[], teamId: string): RawContentItem[] {
    return items.filter(item => {
      const textToCheck = `${item.title} ${item.description}`.toLowerCase();
      return this.textMentionsTeam(textToCheck, teamId);
    });
  }

  private filterByTeams(items: RawContentItem[], teamIds: string[]): RawContentItem[] {
    return items.filter(item => {
      const textToCheck = `${item.title} ${item.description}`.toLowerCase();
      return teamIds.some(teamId => this.textMentionsTeam(textToCheck, teamId));
    });
  }

  private textMentionsTeam(text: string, teamId: string): boolean {
    const keywords = this.getTeamKeywords(teamId);
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
  }

  // --------------------------------------------------------------------------
  // Deduplication
  // --------------------------------------------------------------------------

  private deduplicateContent(items: RawContentItem[]): RawContentItem[] {
    const seen = new Set<string>();
    const deduplicated: RawContentItem[] = [];

    for (const item of items) {
      const words = item.title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 5)
        .sort()
        .join('');

      if (!seen.has(words)) {
        seen.add(words);
        deduplicated.push(item);
      }
    }

    return deduplicated;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private getSourcesByLanguage(languages: string[]): ContentSource[] {
    return CONTENT_SOURCES.filter(s => s.active && languages.includes(s.language));
  }

  private getSourcesForLeague(leagueId: string): ContentSource[] {
    return CONTENT_SOURCES.filter(
      s => s.active && (!s.leagues || s.leagues.length === 0 || s.leagues.includes(leagueId)),
    );
  }

  private getTeamKeywords(teamId: string): string[] {
    const keywords = TEAM_KEYWORDS[teamId];
    if (!keywords) return [teamId.replace(/-/g, ' ')];

    const allKeywords: string[] = [];
    Object.entries(keywords).forEach(([key, langKeywords]) => {
      // Include all keywords: team names (es, en, fr, etc.) and players
      allKeywords.push(...langKeywords);
    });
    return [...new Set(allKeywords)];
  }

  private decodeHTMLEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#039;': "'",
      '&apos;': "'",
      '&nbsp;': ' ',
      '&#x27;': "'",
      '&#x2F;': '/',
      '&ndash;': '-',
      '&mdash;': '-',
      '&lsquo;': "'",
      '&rsquo;': "'",
      '&ldquo;': '"',
      '&rdquo;': '"',
      '&hellip;': '...',
    };

    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
      decoded = decoded.replace(new RegExp(entity, 'gi'), char);
    }
    decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
    decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    return decoded;
  }

  private toContentSuggestion(item: ProcessedContent): ContentSuggestion {
    return {
      id: item.id,
      type: item.type,
      priority: item.priority,
      title: item.title,
      description: item.description,
      source: item.source,
      sourceLanguage: item.originalLanguage,
      sourceUrl: item.sourceUrl,
      imageUrl: item.imageUrl,
      timestamp: item.pubDate,
      suggestedTemplates: item.suggestedTemplates,
      suggestedCaption: item.suggestedCaption,
      hashtags: item.hashtags,
      relevanceScore: item.relevanceScore,
    };
  }

  private errorResponse(error: string, pageType: PageType): ContentSuggestionsResponse {
    return {
      success: false,
      content: [],
      meta: {
        pageType,
        totalItems: 0,
        urgentCount: 0,
        highPriorityCount: 0,
        fetchedAt: new Date(),
      },
      error,
    };
  }
}
