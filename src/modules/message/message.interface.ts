export interface IMessage {
  senderId: Types.ObjectId;
  receiverId: Types.ObjectId;
  text: string;
  image?: string;
  seen?: boolean; 
  deliveryStatus: 'sent' | 'delivered' | 'seen';
  isDeleted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
