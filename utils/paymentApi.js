import axios from "axios";

/*
 BACKEND BASE URL
 Uses .env EXPO_PUBLIC_BACKEND_URL
*/

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

/*
 CREATE PAYMENT
 Passenger pays for ride
*/
export const createPayment = async (data) => {
  try {
    const response = await axios.post(
      `${BASE_URL}/payment`,
      data
    );

    return response.data;
  } catch (error) {
    console.error("Create Payment Error:", error?.response?.data);
    throw error?.response?.data || error.message;
  }
};


/*
 UPDATE PAYMENT STATUS
 success / failed
*/
export const updatePaymentStatus = async (paymentId, data) => {
  try {
    const response = await axios.put(
      `${BASE_URL}/payment/${paymentId}/status`,
      data
    );

    return response.data;
  } catch (error) {
    console.error("Update Payment Error:", error?.response?.data);
    throw error?.response?.data || error.message;
  }
};


/*
 GET PAYMENT BY ID
*/
export const getPaymentById = async (paymentId) => {
  try {
    const response = await axios.get(
      `${BASE_URL}/payment/${paymentId}`
    );

    return response.data;
  } catch (error) {
    console.error("Get Payment Error:", error?.response?.data);
    throw error?.response?.data || error.message;
  }
};


/*
 PASSENGER PAYMENT HISTORY
*/
export const getPassengerPayments = async (passengerId) => {
  try {
    const response = await axios.get(
      `${BASE_URL}/payment/passenger/${passengerId}`
    );

    return response.data;
  } catch (error) {
    console.error("Passenger Payment History Error:", error?.response?.data);
    throw error?.response?.data || error.message;
  }
};


/*
 DRIVER PAYMENT HISTORY
*/
export const getDriverPayments = async (driverId) => {
  try {
    const response = await axios.get(
      `${BASE_URL}/payment/driver/${driverId}`
    );

    return response.data;
  } catch (error) {
    console.error("Driver Payment History Error:", error?.response?.data);
    throw error?.response?.data || error.message;
  }
};


/*
 ADD OR UPDATE DRIVER BANK DETAILS
*/
export const saveBankDetails = async (userId, data) => {
  try {
    const response = await axios.put(
      `${BASE_URL}/driver-bank/${userId}`,
      data
    );

    return response.data;
  } catch (error) {
    console.error("Save Bank Details Error:", error?.response?.data);
    throw error?.response?.data || error.message;
  }
};


/*
 GET DRIVER BANK DETAILS
*/
export const getBankDetails = async (userId) => {
  try {
    const response = await axios.get(
      `${BASE_URL}/driver-bank/${userId}`
    );

    return response.data;
  } catch (error) {
    console.error("Get Bank Details Error:", error?.response?.data);
    throw error?.response?.data || error.message;
  }
};


/*
 DELETE BANK DETAILS
*/
export const deleteBankDetails = async (userId) => {
  try {
    const response = await axios.delete(
      `${BASE_URL}/driver-bank/${userId}`
    );

    return response.data;
  } catch (error) {
    console.error("Delete Bank Details Error:", error?.response?.data);
    throw error?.response?.data || error.message;
  }
};