import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
 

const getAllPrivacyFromDB = async ( ) => {
   const result = {name:"sushil", id:"20259"} ;
   return result;
};


const getSinglePrivacyFromDB = async ( ) => {
   const result = {name:"sushil", id:"20259"} ;
   return result;
};


const addPrivacyIntoDB = async ( ) => {
   const result = {name:"sushil", id:"20259"} ;
   return result;
};


const updatePrivacyFromDB = async ( ) => {
   const result = {name:"sushil", id:"20259"} ;
   return result;
};


const deletePrivacyFromDB = async ( ) => {
   const result = {name:"sushil", id:"20259"} ;
   return result;
};
 
export const PrivacyPolicyService = {
  getAllPrivacyFromDB,
  getSinglePrivacyFromDB,
  addPrivacyIntoDB,
  updatePrivacyFromDB,
  deletePrivacyFromDB
};