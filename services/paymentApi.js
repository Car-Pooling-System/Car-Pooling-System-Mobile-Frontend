import axios from "axios";

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export const createPaymentOrder = async (rideId) => {
  const res = await axios.post(`${API_URL}/payment/create-order`, {
    rideId
  });

  return res.data;
};

export const verifyPayment = async (paymentData) => {
  const res = await axios.post(`${API_URL}/payment/verify`, paymentData);
  return res.data;
};