import { UserRoutes } from './../modules/user/user.route';
import { AuthRoutes } from './../modules/auth/auth.routes';
import express from 'express';
import { ChatRoutes } from '../modules/chat/chat.routes';
import { MessageRoutes } from '../modules/message/message.routes'; 
import { PaymentRoutes } from '../modules/payment/payment.routes';
import { SkiPassRoutes } from './../modules/skiPass/skipass.routes';
 
const router = express.Router();

const apiRoutes = [
  {
    path: '/auth',
    route: AuthRoutes,
  },
  {
    path: '/ski-pass',
    route: SkiPassRoutes,
  },
  {
    path: '/users',
    route: UserRoutes,
  },
  // {
  //   path: '/chats',
  //   route: ChatRoutes,
  // },
  // {
  //   path: '/messages',
  //   route: MessageRoutes,
  // },
   
  // {
  //   path: '/payments',
  //   route: PaymentRoutes,
  // }
];

apiRoutes.forEach(route => router.use(route.path, route.route));

export default router;
