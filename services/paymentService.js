import RazorpayCheckout from "react-native-razorpay";

const RAZORPAY_KEY = "YOUR_RAZORPAY_KEY";

export const startPayment = async (order, user) => {
  const options = {
    description: "Ride Booking",
    currency: "INR",
    key: RAZORPAY_KEY,
    amount: order.amount,
    order_id: order.id,

    name: "Car Pooling",

    prefill: {
      email: user.email,
      contact: user.phone,
      name: user.name
    },

    theme: { color: "#2563eb" }
  };

  return RazorpayCheckout.open(options);
};