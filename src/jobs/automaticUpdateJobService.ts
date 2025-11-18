import cron from 'node-cron';
import { Booking } from './../modules/booking/booking.model';
import { Restaurant } from './../modules/restaurant/restaurant.model';
import moment from 'moment';
import { isRestaurantOpen } from './../utils/restaurentTimeConvert';
import mongoose from 'mongoose';

const startBookingStatusJob = () => {
  // runs every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    const now = new Date();
    await Booking.updateMany(
      { endDateAndTime: { $lt: now }, bookingStatus: { $ne: 'Completed' } },
      { $set: { bookingStatus: 'Completed' } }
    );
    console.log('Auto booking status updated.');
  });

  // console.log('=====> Booking auto-update cron job started.');
};

const startRestaurantStatusJob = () => {
  cron.schedule('*/5 * * * *', async () => {
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
        // Restore expired booking slots
        const expiredBookings = await Booking.find({
          product: restaurant._id,
          date: { $lt: new Date() }, // past bookings
          bookingStatus: 'Completed', // only active bookings
        });

        for (const booking of expiredBookings) {
          // Restore each booked slot
          (booking.slots as string[]).forEach(slotIdStr => {
            const slotId = new mongoose.Types.ObjectId(slotIdStr); // convert string to ObjectId

            const slot: any | undefined = restaurant.slots.find(
              s => s._id && s._id.equals(slotId) 
            );

            if (slot) {
              const exists = restaurant.availableSlots.some(
                s => s._id && s._id.equals(slot._id)
              );

              if (!exists) {
                restaurant.availableSlots.push({
                  _id: slot._id,
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                });
              }
            }
          });

          // Mark booking as Completed
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

export const startAllCronJobs = () => {
  startBookingStatusJob();
  startRestaurantStatusJob();
};
