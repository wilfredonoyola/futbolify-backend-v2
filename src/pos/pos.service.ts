import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderItem } from './schemas/order.schema';
import { InventoryService } from 'src/inventory/inventory.service';
import { ItemType } from './enums/item-type.enum';
import { ProcessOrderInput } from './dto/process-order.input';
import { OrderItemOutput, OrderOutput } from './dto/order.ouput';
import { CurrentUserPayload } from 'src/auth/current-user-payload.interface';
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  getUnixTime,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachDayOfInterval,
  getISOWeek,
  addWeeks,
  format,
  parseISO,
  getDay,
  addDays,
} from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import {
  CustomDateRangeOutput,
  OrdersGroupedByPeriodsOutput,
  WeekOutput,
} from './dto/order-period.ouput';

@Injectable()
export class PosService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    private readonly inventoryService: InventoryService,
  ) {}

  async createOrder(
    input: ProcessOrderInput,
    user: CurrentUserPayload,
  ): Promise<boolean> {
    const { items, total } = input;
    const orderItems: OrderItem[] = [];
    const itemsMap: { [key: string]: OrderItem } = {};

    for (const item of items) {
      if (itemsMap[item.id]) {
        itemsMap[item.id].quantity += item.quantity;
      } else {
        itemsMap[item.id] = {
          id: item.id,
          name: item.name,
          type: item.type,
          price: item.price,
          quantity: item.quantity,
          discount: item.discount,
          createdAt: item.createdAt,
          total: item.total,
        };
      }
      if (item.type === ItemType.PRODUCT) {
        const product = await this.inventoryService.findProductById(item.id);
        if (product.quantity < item.quantity) {
          throw new Error(
            `Cantidad insuficiente disponible para el producto: ${product.name}.`,
          );
        }
        await this.inventoryService.reduceStock(item.id, item.quantity);
      }
    }

    for (const key in itemsMap) {
      orderItems.push(itemsMap[key]);
    }
    const newOrder = new this.orderModel({
      items: orderItems,
      total,
      company: new Types.ObjectId(user.company._id),
      createdBy: new Types.ObjectId(user.id),
    });
    await newOrder.save();
    return true;
  }

  async findOneOrder(orderId: string): Promise<OrderOutput> {
    const order = await this.orderModel
      .findOne({ _id: orderId })
      .populate('items')
      .exec();

    if (!order) {
      throw new Error('Order not found');
    }

    return this.toOrderOutput(order);
  }

  async findAllOrders(user: CurrentUserPayload): Promise<OrderOutput[]> {
    const orders = await this.orderModel
      .find({ company: user.company._id })
      .populate('items')
      .lean()
      .sort({ createdAt: -1 })
      .exec();

    return orders.map((order) => {
      const itemsMap: { [key: string]: OrderItem } = {};

      order.items.forEach((item) => {
        if (itemsMap[item.id]) {
          itemsMap[item.id].quantity += item.quantity;
        } else {
          itemsMap[item.id] = { ...item };
        }
      });
      const groupedItems = Object.values(itemsMap);
      return {
        id: order._id.toString(),
        items: groupedItems,
        total: order.total,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    });
  }

  private toOrderOutput(order: Order): OrderOutput {
    return {
      id: order._id.toString(),
      items: order.items.map(
        (item: OrderItem): OrderItemOutput => ({
          id: item.id,
          name: item.name,
          type: item.type,
          price: item.price,
          quantity: item.quantity,
          discount: item.discount ?? 0,
        }),
      ),
      total: Math.round(order.total * 100) / 100,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  async findOrdersByDateRange(
    startDate: Date,
    endDate: Date,
    user: CurrentUserPayload,
  ): Promise<OrderOutput[]> {
    const timeZone = 'America/El_Salvador';

    const startDateLocal = utcToZonedTime(startDate, timeZone);
    const endDateLocal = utcToZonedTime(endDate, timeZone);

    const orders = await this.orderModel.aggregate([
      {
        $addFields: {
          localCreatedAt: {
            $dateToString: {
              format: '%Y-%m-%dT%H:%M:%S.%LZ',
              date: { $toDate: { $multiply: ['$createdAt', 1000] } },
              timezone: timeZone,
            },
          },
        },
      },
      {
        $match: {
          company: user.company._id,
          localCreatedAt: {
            $gte: startDateLocal.toISOString(),
            $lte: endDateLocal.toISOString(),
          },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    return orders.map((order) => ({
      id: order._id.toString(),
      items: order.items || [],
      total: order.total || 0,
      createdAt: order.createdAt,
      updatedAt: order.createdAt,
      companyId: order.company.toString(),
    }));
  }

  async findOrdersByCustomDateRange(
    startDate: Date,
    endDate: Date,
    user: CurrentUserPayload,
  ): Promise<CustomDateRangeOutput> {
    const timeZone = 'America/El_Salvador';

    const localStartDate = new Date(
      startDate.toISOString().split('T')[0] + 'T00:00:00.000Z',
    );
    const localEndDate = new Date(
      endDate.toISOString().split('T')[0] + 'T23:59:59.999Z',
    );

    const orders = await this.orderModel.aggregate([
      {
        $addFields: {
          localCreatedAt: {
            $dateToString: {
              format: '%Y-%m-%dT%H:%M:%S.%LZ',
              date: { $toDate: { $multiply: ['$createdAt', 1000] } },
              timezone: timeZone,
            },
          },
        },
      },
      {
        $match: {
          company: user.company._id,
          localCreatedAt: {
            $gte: localStartDate.toISOString(),
            $lte: localEndDate.toISOString(),
          },
        },
      },
      {
        $facet: {
          orders: [
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: { $toDate: { $multiply: ['$createdAt', 1000] } },
                    timezone: timeZone,
                  },
                },
                orders: { $push: '$$ROOT' },
              },
            },
            { $sort: { _id: 1 } },
          ],
          mostSoldItems: [
            { $unwind: '$items' },
            {
              $group: {
                _id: '$items.id',
                totalSold: { $sum: '$items.quantity' },
                name: { $first: '$items.name' },
                type: { $first: '$items.type' },
                price: { $first: '$items.price' },
              },
            },
            { $sort: { totalSold: -1 } },
            { $limit: 5 },
          ],
          metrics: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: '$total' },
                totalOrders: { $sum: 1 },
              },
            },
          ],
          totalProductsSold: [
            { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
            { $match: { 'items.type': 'product' } },
            {
              $group: {
                _id: null,
                totalProductsSold: { $sum: '$items.quantity' },
              },
            },
          ],
          totalServicesSold: [
            { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
            { $match: { 'items.type': 'service' } },
            {
              $group: {
                _id: null,
                totalServicesSold: { $sum: '$items.quantity' },
              },
            },
          ],
        },
      },
      {
        $project: {
          orders: 1,
          mostSoldItems: 1,
          totalRevenue: {
            $ifNull: [{ $arrayElemAt: ['$metrics.totalRevenue', 0] }, 0],
          },
          totalOrders: {
            $ifNull: [{ $arrayElemAt: ['$metrics.totalOrders', 0] }, 0],
          },
          totalProductsSold: {
            $ifNull: [
              { $arrayElemAt: ['$totalProductsSold.totalProductsSold', 0] },
              0,
            ],
          },
          totalServicesSold: {
            $ifNull: [
              { $arrayElemAt: ['$totalServicesSold.totalServicesSold', 0] },
              0,
            ],
          },
        },
      },
      {
        $addFields: {
          averageSalesValue: {
            $cond: [
              { $eq: ['$totalOrders', 0] },
              0,
              { $divide: ['$totalRevenue', '$totalOrders'] },
            ],
          },
        },
      },
    ]);

    const dailyOrdersMap = new Map<string, OrderOutput[]>();

    orders[0]?.orders.forEach((day) => {
      const orderDate = format(parseISO(day._id), 'yyyy-MM-dd');
      dailyOrdersMap.set(orderDate, day.orders.map(this.toOrderOutput));
    });

    const generateWeeklyOrders = (start: Date, end: Date): WeekOutput[] => {
      const normalizeToMonday = (date: Date): Date => {
        const day = date.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        const normalized = new Date(date);
        normalized.setDate(normalized.getDate() + diff);
        normalized.setHours(0, 0, 0, 0);
        return normalized;
      };

      const normalizedStart = normalizeToMonday(start);
      const normalizedEnd = new Date(end);
      normalizedEnd.setHours(23, 59, 59, 999);

      const weeklyOrders: WeekOutput[] = [];
      let currentDate = normalizedStart;

      while (currentDate <= normalizedEnd) {
        const weekStart = currentDate;
        const weekEnd = addDays(weekStart, 6);

        if (weekStart > end || weekEnd < start) {
          currentDate = addWeeks(currentDate, 1);
          continue;
        }

        const week: OrderOutput[][] = Array(7).fill([]);
        const weekNumber = weeklyOrders.length + 1;

        dailyOrdersMap.forEach((orders, date) => {
          const parsedDate = parseISO(date);
          if (parsedDate >= weekStart && parsedDate <= weekEnd) {
            const dayIndex = (getDay(parsedDate) + 6) % 7;
            week[dayIndex] = orders;
          }
        });

        weeklyOrders.push({ weekNumber, days: week });

        currentDate = addWeeks(currentDate, 1);
      }

      return weeklyOrders;
    };

    const weeklyOrders = generateWeeklyOrders(localStartDate, localEndDate);

    const mostSoldItems = orders[0]?.mostSoldItems || [];
    const metrics = orders[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      totalProductsSold: 0,
      totalServicesSold: 0,
    };

    const totalRevenue = metrics.totalRevenue || 0;
    const totalOrders = metrics.totalOrders || 0;
    const totalProductsSold = metrics.totalProductsSold || 0;
    const totalServicesSold = metrics.totalServicesSold || 0;

    const averageSalesValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const response: CustomDateRangeOutput = {
      weeklyDate: weeklyOrders,
      mostSoldItems,
      totalRevenue,
      totalOrders,
      averageSalesValue,
      totalProductsSold,
      totalServicesSold,
    };

    return response;
  }

  async getOrdersGroupedByPeriods(
    user: CurrentUserPayload,
    year?: number,
    month?: number,
    week?: number,
  ): Promise<OrdersGroupedByPeriodsOutput> {
    const timeZone = 'America/El_Salvador';
    const now = new Date();
    const zonedNow = utcToZonedTime(now, timeZone);

    const targetYear = year || zonedNow.getFullYear();
    const targetMonth = month !== undefined ? month - 1 : zonedNow.getMonth();
    const targetWeek = week || getISOWeek(zonedNow);

    const startOfWeekDate = startOfWeek(new Date(targetYear, 0, 1), {
      weekStartsOn: 1,
    });
    const targetWeekStart = addWeeks(startOfWeekDate, targetWeek - 1);
    const targetWeekEnd = endOfWeek(targetWeekStart, { weekStartsOn: 1 });
    const daysOfWeek = eachDayOfInterval({
      start: targetWeekStart,
      end: targetWeekEnd,
    });

    const dailyOrders = await Promise.all(
      daysOfWeek.map(async (day) => {
        const startOfDayUnix = getUnixTime(startOfDay(day));
        const endOfDayUnix = getUnixTime(endOfDay(day));

        const orders = await this.orderModel
          .find({
            company: user.company._id,
            createdAt: { $gte: startOfDayUnix, $lte: endOfDayUnix },
          })
          .populate('items')
          .exec();
        return orders.map(this.toOrderOutput);
      }),
    );

    const startOfMonthDate = startOfMonth(new Date(targetYear, targetMonth, 1));
    const endOfMonthDate = endOfMonth(startOfMonthDate);
    const weeksOfMonth = eachWeekOfInterval(
      { start: startOfMonthDate, end: endOfMonthDate },
      { weekStartsOn: 1 },
    );

    const weeklyOrders = await Promise.all(
      weeksOfMonth.map(async (weekStart) => {
        const startOfWeekUnix = getUnixTime(startOfDay(weekStart));
        const endOfWeekUnix = getUnixTime(
          endOfDay(endOfWeek(weekStart, { weekStartsOn: 1 })),
        );

        const orders = await this.orderModel
          .find({
            company: user.company._id,
            createdAt: { $gte: startOfWeekUnix, $lte: endOfWeekUnix },
          })
          .populate('items')
          .exec();
        return orders.map(this.toOrderOutput);
      }),
    );

    const monthsOfYear = eachMonthOfInterval({
      start: new Date(targetYear, 0, 1),
      end: new Date(targetYear, 11, 31),
    });

    const monthlyOrders = await Promise.all(
      monthsOfYear.map(async (monthStart) => {
        const startOfMonthUnix = getUnixTime(startOfDay(monthStart));
        const endOfMonthUnix = getUnixTime(endOfDay(endOfMonth(monthStart)));
        const orders = await this.orderModel
          .find({
            company: user.company._id,
            createdAt: { $gte: startOfMonthUnix, $lte: endOfMonthUnix },
          })
          .populate('items')
          .exec();
        return orders.map(this.toOrderOutput);
      }),
    );

    return {
      daily: dailyOrders,
      weekly: weeklyOrders,
      monthly: monthlyOrders,
    };
  }
}
