import { Model, Types } from 'mongoose';
import { IPaginationOptions, IPaginationResult } from '../../types/pagination';

export enum ChatType {
  GROUP = 'group',
  SINGLE = 'single',
}

export interface IChat {
  _id?: Types.ObjectId;
  chatType: ChatType;
  participants: Types.ObjectId[];
  chatName?: string;
  lastMessage?: Types.ObjectId;
  isGroupChat?: boolean;
  groupAdmin?: Types.ObjectId;
  isDeleted: boolean;
  pinnedMessages?: Types.ObjectId[];
  groupSettings?: {
    allowAddParticipants: boolean;
    allowRemoveParticipants: boolean;
  };
  createdAt?: Date;
  updatedAt?: Date;
}



// export interface IChatModel extends Model<IChat> {
//   paginate(
//     filter: Record<string, any>,
//     options: IPaginationOptions
//   ): Promise<IPaginationResult<IChat>>;
// }