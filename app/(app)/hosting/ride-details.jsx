import React from "react";
import { View, Text, Button, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";

export default function RideDetails() {

  const router = useRouter();

  /*
  Ride data passed from previous screen
  */
  const ride = useLocalSearchParams();

  /*
  Example user (replace later with auth user)
  */
  const currentUser = {
    _id: "demoPassenger123",
    name: "Passenger",
    email: "passenger@test.com",
    phone: "9999999999"
  };

  const handleBooking = () => {

    router.push({
      pathname: "/payment/payment-screen",
      params: {
        rideId: ride._id,
        passengerId: currentUser._id,
        driverId: ride.driverId,
        boardingKm: 0,
        dropKm: ride.distance
      }
    });

  };

  return (
    <View style={styles.container}>

      <Text style={styles.title}>Ride Details</Text>

      <Text>From: {ride.origin}</Text>
      <Text>To: {ride.destination}</Text>
      <Text>Driver: {ride.driverName}</Text>
      <Text>Distance: {ride.distance} km</Text>

      <View style={{ marginTop: 30 }}>
        <Button
          title="Book Ride"
          onPress={handleBooking}
        />
      </View>

    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center"
  },

  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20
  }

});