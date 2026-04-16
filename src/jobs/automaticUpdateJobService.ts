import cron from 'node-cron';
import { Booking } from './../modules/booking/booking.model';
import { Restaurant } from './../modules/restaurant/restaurant.model';
import moment from 'moment';
import { isRestaurantOpen } from './../utils/restaurentTimeConvert';
import mongoose from 'mongoose';
import { IBookingItem } from './../modules/booking/booking.interface';
import { SkiHire } from '../modules/skiHire/skihire.model';
// all common booking status
const startBookingStatusJob = () => {
  // runs every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    const now = new Date();
    await Booking.updateMany(
      { endDateAndTime: { $lt: now }, bookingStatus: { $ne: 'Completed' } },
      { $set: { bookingStatus: 'Completed' } },
    );
    console.log('Auto booking status updated.');
  });

  // console.log('=====> Booking auto-update cron job started.');
};

// restaurant booking status
const startRestaurantStatusJob = () => {
  cron.schedule('*/1 * * * *', async () => {
    try {
      const restaurants = await Restaurant.find();

      for (const restaurant of restaurants) {
        const { openTime, closeTime } = restaurant;

        const isOpen = isRestaurantOpen(openTime, closeTime);

        if (isOpen && restaurant.status !== 'Open') {
          restaurant.status = 'Open';
          await restaurant.save({ validateBeforeSave: false });
        } else if (!isOpen && restaurant.status !== 'Closed') {
          restaurant.status = 'Closed';
          await restaurant.save({ validateBeforeSave: false });
        }
        // Find expired bookings for this restaurant
        const expiredBookings =
          (await Booking.find({
            product: restaurant._id,
            date: { $lt: new Date() }, // past bookings
            bookingStatus: 'Active',
          })) || [];

        // console.log("Current booking data ===>",expiredBookings);

        for (const booking of expiredBookings) {
          // Restore only slots that were booked
          (booking.slots || []).forEach((slotIdStr: any) => {
            const slotId = new mongoose.Types.ObjectId(slotIdStr);
            const slot = restaurant?.slots.find(
              (s: any) => s?._id && s?._id.equals(slotId),
            );

            if (slot) {
              const alreadyAvailable = restaurant.availableSlots.some(
                (s: any) => s?._id && s?._id.equals(slot._id),
              );
              //  console.log("slots ==> ",slot );
              //  console.log("already avaiable slots ==> ",alreadyAvailable );
              if (!alreadyAvailable) {
                restaurant.availableSlots.push({
                  _id: slot?._id,
                  startTime: slot?.startTime,
                  endTime: slot?.endTime,
                });
              }
            }
          });
          // Restore items quantities
          // if (booking?.items && booking?.items.length > 0) {
          //   booking?.items.forEach(item => {
          //     const itemId = new mongoose.Types.ObjectId(item.itemId);
          //     const foundItem = restaurant.items.find(
          //       i => i._id && i._id.equals(itemId),
          //     );

          //     if (foundItem) {
          //       foundItem.availableQty += item.qty;
          //       if (foundItem.availableQty > foundItem.totalQty) {
          //         foundItem.availableQty = foundItem.totalQty;
          //       }
          //     }
          //   });
          // }
          // 1. Check for 'bookingItems' (matching your interface)
          if (booking.bookingItems && booking.bookingItems.length > 0) {
            // 2. Explicitly type 'item' to fix the 'any' type error
            booking.bookingItems.forEach((item: IBookingItem) => {
              const itemId = new mongoose.Types.ObjectId(item.itemId);

              const foundItem = restaurant.items.find((i: any) => {
                // 3. Using optional chaining or casting to 'any'
                // if ICategoryItemDetail is missing _id in its definition
                const id = i._id || (i as any)._id;
                return id && id.equals(itemId);
              });

              if (foundItem) {
                // Note: Use 'item.quantity' to match your IBookingItem interface
                foundItem.availableQty += item.quantity;

                if (foundItem.availableQty > foundItem.totalQty) {
                  foundItem.availableQty = foundItem.totalQty;
                }
              }
            });
          }
          // Mark booking as Completed
          await restaurant.save({ validateBeforeSave: false });

          booking.bookingStatus = 'Completed';
          await booking.save({ validateBeforeSave: false });
        }
      }
      console.log('====> Restaurant statuses updated successfully.');
    } catch (err) {
      console.error('Error updating restaurant statuses:', err);
    }
  });

  // console.log('=====> Restaurant status cron job started.');
};

//  ski hire booking status
const startSkiHireRestoreJob = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();

      // Find all expired bookings that are not completed yet
      const expiredBookings = await Booking.find({
        endDateAndTime: { $lt: now },
        bookingStatus: { $ne: 'Completed' },
        productModel: 'SkiHire',
      });

      // for (const booking of expiredBookings) {
      //   const skiHire = await SkiHire.findById(booking.product);

      //   if (!skiHire) continue;

      //   // Restore item quantities
      //   booking.bookingItems.forEach(bItem => {
      //     const item = skiHire.items.find(
      //       it => it._id.toString() === bItem.itemId.toString(),
      //     );

      //     if (item) {
      //       item.availableQty += bItem.quantity;
      //     }
      //   });

      //   await skiHire.save();

      //   // Set booking status to completed
      //   booking.bookingStatus = 'Completed';
      //   await booking.save();
      // }
      for (const booking of expiredBookings) {
        const skiHire = await SkiHire.findById(booking.product);

        if (!skiHire) continue;

        // 1. Added optional chaining (?.) to bookingItems
        booking.bookingItems?.forEach(bItem => {
          const item = skiHire.items.find(it => {
            // 2. Added check to ensure it._id exists before calling .toString()
            if (!it._id || !bItem.itemId) return false;
            return it._id.toString() === bItem.itemId.toString();
          });

          // 3. Added check for item and item.availableQty
          if (item && typeof item.availableQty === 'number') {
            item.availableQty += bItem.quantity;
          }
        });

        await skiHire.save();

        // Set booking status to completed
        booking.bookingStatus = 'Completed';
        await booking.save();
      }

      console.log('===> Ski Hire qty restored & bookings updated');
    } catch (error) {
      console.error('❌ Error in Ski Hire restore cron:', error);
    }
  });

  // console.log('===> Ski Hire restore cron job started...');
};

export const startAllCronJobs = () => {
  startBookingStatusJob();
  startRestaurantStatusJob();
};
