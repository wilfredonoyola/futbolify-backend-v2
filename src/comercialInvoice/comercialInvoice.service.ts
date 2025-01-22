import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  subMonths,
  getUnixTime,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { CurrentUserPayload } from 'src/auth/current-user-payload.interface';
import { OrderOutput } from 'src/pos/dto/order.ouput';
import { Order, OrderItem } from 'src/pos/schemas/order.schema';
import { formatInTimeZone, utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import { Invoice } from './schemas/comercialInvoice.schema';
import { InvoiceOutput } from './dto/comercialinvoice.ouput';

@Injectable()
export class CommercialInvoicePosService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Invoice.name)
    private readonly InvoiceModel: Model<Invoice>,
  ) {}

  async findPreviousMonthInvoices(
    user: CurrentUserPayload,
  ): Promise<OrderOutput[]> {
    const timeZone = 'America/El_Salvador';
    const previousMonth = subMonths(new Date(), 1);
    const timeZoneOffset = -6 * 60 * 60 * 1000;
    const startOfLastMonthLocal = new Date(
      startOfMonth(previousMonth).getTime() + timeZoneOffset,
    );
    const endOfLastMonthLocal = new Date(
      endOfMonth(previousMonth).getTime() + timeZoneOffset,
    );

    const localStartDate = new Date(
      startOfLastMonthLocal.toISOString().split('T')[0] + 'T00:00:00.000Z',
    );
    const localEndDate = new Date(
      endOfLastMonthLocal.toISOString().split('T')[0] + 'T23:59:59.999Z',
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
      { $sort: { createdAt: -1 } },
    ]);

    return orders.map((order) => {
      const createdAtUnixTime = Math.floor(
        new Date(order.localCreatedAt).getTime() / 1000,
      );

      return {
        id: order._id.toString(),
        items: order.items || [],
        total: order.total || 0,
        createdAt: createdAtUnixTime,
        updatedAt: createdAtUnixTime,
        companyId: order.company.toString(),
      };
    });
  }

  async findTodayInvoices(
    user: CurrentUserPayload,
    date: Date,
  ): Promise<OrderOutput[]> {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const localDate = utcToZonedTime(date, timeZone);

    const startOfSelectedDay = getUnixTime(
      zonedTimeToUtc(startOfDay(localDate), timeZone),
    );
    const endOfSelectedDay = getUnixTime(
      zonedTimeToUtc(endOfDay(localDate), timeZone),
    );

    const orders = await this.orderModel
      .find({
        company: user.company._id,
        createdAt: { $gte: startOfSelectedDay, $lte: endOfSelectedDay },
      })
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

      const createdAtLocal = utcToZonedTime(
        new Date(order.createdAt * 1000),
        timeZone,
      );
      const updatedAtLocal = utcToZonedTime(
        new Date(order.updatedAt * 1000),
        timeZone,
      );

      const createdAtFormatted = formatInTimeZone(
        createdAtLocal,
        timeZone,
        'yyyy-MM-dd HH:mm:ss',
      );
      const updatedAtFormatted = formatInTimeZone(
        updatedAtLocal,
        timeZone,
        'yyyy-MM-dd HH:mm:ss',
      );

      return {
        id: order._id.toString(),
        items: groupedItems,
        total: order.total,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        createdAtFormatted,
        updatedAtFormatted,
      };
    });
  }

  async excludeInvoices(
    user: CurrentUserPayload,
    excludeInvoiceIds: string[] | string | null,
    excludeProducts: { invoiceId: string; productorserviceId: string }[] | null,
  ): Promise<boolean> {
    try {
      const allInvoices = await this.findPreviousMonthInvoices(user);

      const cleanedExcludeInvoiceIds = Array.isArray(excludeInvoiceIds)
        ? excludeInvoiceIds.map((id) => id.trim())
        : excludeInvoiceIds === ''
        ? []
        : [];

      const existingInvoices = await this.InvoiceModel.find({
        _id: { $in: cleanedExcludeInvoiceIds },
      })
        .select('_id')
        .lean();

      const existingIds = new Set(
        existingInvoices.map((invoice) => invoice._id.toString()),
      );

      const invoicesToSave = allInvoices.filter((invoice) => {
        return !cleanedExcludeInvoiceIds.includes(invoice.id);
      });

      if (existingIds.size > 0) {
        await this.InvoiceModel.deleteMany({
          _id: { $in: Array.from(existingIds) },
        });
      }

      if (invoicesToSave.length === 0) {
        return true;
      }

      const excludeMap = new Map<string, Set<string>>();
      if (excludeProducts) {
        excludeProducts.forEach(({ invoiceId, productorserviceId }) => {
          if (!excludeMap.has(invoiceId)) {
            excludeMap.set(invoiceId, new Set());
          }
          excludeMap.get(invoiceId)?.add(productorserviceId.trim());
        });
      }

      for (const invoice of invoicesToSave) {
        const productIdsToExclude = excludeMap.get(invoice.id) || new Set();
        invoice.items = invoice.items.filter(
          (item) => !productIdsToExclude.has(item.id.trim()),
        );

        invoice.total = invoice.items.reduce((total, item) => {
          const discountedPrice = item.price - (item.discount || 0);
          return total + discountedPrice * item.quantity;
        }, 0);

        await this.InvoiceModel.updateOne(
          { _id: invoice.id },
          { $set: { items: invoice.items, total: invoice.total } },
        );
      }

      const invoiceIdsToSave = invoicesToSave.map((invoice) => invoice.id);

      const existingInvoicesToSave = await this.InvoiceModel.find({
        _id: { $in: invoiceIdsToSave },
      })
        .select('_id')
        .lean();

      const existingSaveIds = new Set(
        existingInvoicesToSave.map((invoice) => invoice._id.toString()),
      );

      const invoicesToInsert = invoicesToSave.filter(
        (invoice) => !existingSaveIds.has(invoice.id),
      );

      const invoicesWithItems = invoicesToInsert.map((invoice) => ({
        _id: invoice.id,
        createdBy: user.id,
        total: invoice.total,
        company: user.company._id,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
        items: invoice.items.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          price: item.price,
          quantity: item.quantity,
          discount: item.discount,
        })),
      }));

      if (invoicesWithItems.length > 0) {
        await this.InvoiceModel.insertMany(invoicesWithItems);
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  async findAllInvoices(user: CurrentUserPayload): Promise<InvoiceOutput[]> {
    const timeZone = 'America/El_Salvador';

    const utcLastMonthStart = startOfMonth(subMonths(new Date(), 1));
    const utcLastMonthEnd = endOfMonth(subMonths(new Date(), 1));

    const localLastMonthStart = utcToZonedTime(utcLastMonthStart, timeZone);
    const localLastMonthEnd = utcToZonedTime(utcLastMonthEnd, timeZone);

    const invoices = await this.InvoiceModel.find({
      company: user.company._id,
      createdAt: {
        $gte: Math.floor(localLastMonthStart.getTime() / 1000),
        $lte: Math.floor(localLastMonthEnd.getTime() / 1000),
      },
    })
      .populate('items')
      .lean()
      .sort({ createdAt: -1 })
      .exec();

    return invoices.map((invoice) => {
      const itemsMap: { [key: string]: OrderItem } = {};

      invoice.items.forEach((item) => {
        if (itemsMap[item.id]) {
          itemsMap[item.id].quantity += item.quantity;
        } else {
          itemsMap[item.id] = { ...item };
        }
      });

      const groupedItems = Object.values(itemsMap);

      const createdAtTimestamp = invoice.createdAt;
      const updatedAtTimestamp = invoice.updatedAt;

      return {
        id: invoice._id.toString(),
        items: groupedItems,
        total: invoice.total,
        createdAt: createdAtTimestamp,
        updatedAt: updatedAtTimestamp,
      };
    });
  }
}
