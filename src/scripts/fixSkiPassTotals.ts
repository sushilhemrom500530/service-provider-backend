/**
 * One-off fix for Ski Pass bookings saved with the wrong totalPrice
 * (price of one pass, or 0, instead of pass amount x personCount).
 *
 * For every wrong booking it corrects:
 *   - Booking.totalPrice
 *   - Payment.amount (payment record of that booking)
 *   - the provider's Wallet balance (+ an "Earn" transaction for the difference)
 *
 * Usage:
 *   npm run fix:skipass-totals                          -> dry run, prints what would change
 *   npm run fix:skipass-totals -- --apply               -> writes the changes
 *   npm run fix:skipass-totals -- --tickets=TKT-1,TKT-2 -> only these tickets (works with --apply)
 *
 * Always run the dry run first and compare "should be" with the amount
 * charged in the Stripe Dashboard (transactionId is printed for each row).
 * The correct price uses the pass amount as it is today; if a pass price was
 * changed after the booking, fix that booking by hand instead.
 */
import mongoose from 'mongoose';
import { config } from '../config';
import { Booking } from '../modules/booking/booking.model';
import { SkiPass } from '../modules/skiPass/skipass.model';
import { Payment } from '../modules/payment/payment.model';
import { Wallet } from '../modules/wallet/wallet.model';
import { WalletTransactionType } from '../modules/wallet/wallet.interface';

const APPLY = process.argv.includes('--apply');
const ticketArg = process.argv.find(a => a.startsWith('--tickets='));
const TICKETS = ticketArg
  ? ticketArg
      .replace('--tickets=', '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
  : [];

const round2 = (n: number) => Math.round(n * 100) / 100;

const run = async () => {
  await mongoose.connect(config.database.mongoUrl as string);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN'}\n`);

  const filter: any = {
    category: 'Ski_Pass',
    bookingStatus: { $nin: ['Cancelled', 'Deleted'] },
  };
  if (TICKETS.length) filter.ticketNumber = { $in: TICKETS };

  const bookings = await Booking.find(filter).lean();
  let wrong = 0;

  for (const booking of bookings) {
    const pass: any = await SkiPass.findById(booking.product).lean();
    if (!pass) {
      console.log(`SKIP ${booking.ticketNumber || booking._id}: ski pass not found`);
      continue;
    }

    const guests = Number(booking.personCount) > 0 ? Number(booking.personCount) : 1;
    const shouldBe = round2(Number(pass.amount) * guests);
    const saved = Number(booking.totalPrice) || 0;
    const diff = round2(shouldBe - saved);

    if (diff === 0) continue;
    wrong++;

    const payment = await Payment.findOne({ booking: booking._id });

    console.log(
      `${booking.ticketNumber || booking._id} | ${guests} x ${pass.amount} | saved ${saved} -> should be ${shouldBe} | diff ${diff} | payment ${payment?.transactionId || 'none'}`,
    );

    if (!APPLY) continue;

    await Booking.updateOne(
      { _id: booking._id },
      { $set: { totalPrice: shouldBe } },
    );

    if (payment) {
      await Payment.updateOne(
        { _id: payment._id },
        { $set: { amount: shouldBe } },
      );
    }

    const wallet = await Wallet.findOne({ user: pass.owner });
    if (wallet) {
      wallet.balance = round2(wallet.balance + diff);
      wallet.transactions.push({
        user: pass.owner,
        balance: diff,
        type: WalletTransactionType.EARN,
      });
      await wallet.save();
    } else {
      console.log(`  ! provider ${pass.owner} has no wallet; wallet not changed`);
    }
  }

  console.log(
    `\n${wrong} wrong booking(s) found${APPLY ? ' and fixed' : '. Run again with --apply to fix them'}.`,
  );
};

run()
  .catch(error => {
    console.error('Fix failed:', error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
