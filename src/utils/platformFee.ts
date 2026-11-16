import { User } from '../modules/user/user.model';
import { Wallet } from '../modules/wallet/wallet.model';

/**
 * Platform fee (admin "profitCharge", a percentage set from the admin panel
 * through PATCH wallet profit, stored on the admin wallet).
 *
 * The fee is taken when the provider EARNS the money (booking completed /
 * payout released), so the provider wallet always shows what they really get.
 * Withdrawals therefore no longer take the fee a second time.
 */
export const PLATFORM_FEE_ON_EARNING = true;

const round2 = (n: number) => Math.round(n * 100) / 100;

// Current fee percentage (0 when no admin wallet / no fee set)
export const getPlatformFeePercent = async (): Promise<number> => {
  const admins = await User.find({ role: 'Admin' }).select('_id').lean();
  if (!admins.length) return 0;
  const adminWallet: any = await Wallet.findOne({
    user: { $in: admins.map(a => a._id) },
  })
    .select('profitCharge')
    .lean();
  const percent = Number(adminWallet?.profitCharge) || 0;
  return Math.min(Math.max(percent, 0), 100);
};

/**
 * Split a gross amount into the platform fee and the provider's share.
 *  100 at 20% -> { fee: 20, net: 80, percent: 20 }
 */
export const splitPlatformFee = async (gross: number) => {
  const amount = Number(gross) || 0;
  const percent = PLATFORM_FEE_ON_EARNING ? await getPlatformFeePercent() : 0;
  const fee = round2((amount * percent) / 100);
  return { fee, net: round2(amount - fee), percent };
};
