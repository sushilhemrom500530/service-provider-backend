import express from 'express';
import { UserRoutes } from './../modules/user/user.route';
import { AuthRoutes } from './../modules/auth/auth.routes';
import { ChatRoutes } from '../modules/chat/chat.routes';
import { MessageRoutes } from '../modules/message/message.routes';
import { PaymentRoutes } from '../modules/payment/payment.routes';
import { SkiPassRoutes } from './../modules/skiPass/skipass.routes';
import { AboutUsRoutes } from './../modules/settings/about-us/about.routes';
import { PrivacyPolicyRoutes } from './../modules/settings/privacy-policy/privacyPolicy.routes';
import { TermsAndServiceRoutes } from './../modules/settings/terms-service/termsService.routes';
import { BookingRoutes } from './../modules/booking/booking.routes';
import { RestaurantRoutes } from './../modules/restaurant/restaurant.routes';
import { MassageRoutes } from './../modules/massage/massage.routes';
import { TransportRoutes } from './../modules/transport/transport.routes';
import { SkiHireRoutes } from './../modules/skiHire/skihire.routes';
import { CategoryRoutes } from './../modules/category/category.route';
import { CommonRoutes } from './../modules/common/common.routes';
import { PaymentRoutes } from './../modules/payment/payment.routes';
import { WalletRoutes } from './../modules/wallet/wallet.routes';
import { MessageRoutes } from './../modules/message/message.routes';  
import { WithdrawRoutes } from './../modules/withdraw/withdraw.routes';

const router = express.Router();

const apiRoutes = [
  {
    path: '/auth',
    route: AuthRoutes,
  },

  {
    path: '/booking',
    route: BookingRoutes,
  },
  {
    path: '/settings/about-us',
    route: AboutUsRoutes,
  },
  {
    path: '/settings/privacy-policy',
    route: PrivacyPolicyRoutes,
  },
  {
    path: '/settings/terms-service',
    route: TermsAndServiceRoutes,
  },
  {
    path: '/users',
    route: UserRoutes,
  },
  {
    path: '/ski-pass',
    route: SkiPassRoutes,
  },
  {
    path: '/massage',
    route: MassageRoutes,
  },
  {
    path: '/restaurant',
    route: RestaurantRoutes,
  },
  {
    path: '/transport',
    route: TransportRoutes,
  },
  {
    path: '/ski-hire',
    route: SkiHireRoutes,
  },
  {
    path: '/category',
    route: CategoryRoutes,
  },
  {
    path: '/common/category',
    route: CommonRoutes,
  },
  {
    path: '/wallet',
    route: WalletRoutes,
  },
  {
    path: '/message',
    route: MessageRoutes,
  },

  {
    path: '/payment',
    route: PaymentRoutes,
  },
  {
    path: '/Withdraw',
    route: WithdrawRoutes,
  }
];

apiRoutes.forEach(route => router.use(route.path, route.route));

export default router;
