import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import axios from "axios";

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function MyRides() {

  const [rides, setRides] = useState([]);

  const passengerId = "demoPassenger123";

  useEffect(() => {

    const fetchRides = async () => {

      try {

        const res = await axios.get(
          `${API_URL}/payment/passenger/${passengerId}`
        );

        setRides(res.data);

      } catch (err) {

        console.log("Ride history error", err);

      }

    };

    fetchRides();

  }, []);

  return (

    <View style={styles.container}>

      <Text style={styles.title}>My Rides</Text>

      <FlatList
        data={rides}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (

          <View style={styles.card}>

            <Text>Ride ID: {item.rideId}</Text>

            <Text>Distance: {item.travelDistanceKm} km</Text>

            <Text>Amount: ₹{item.amount}</Text>

            <Text>Status: {item.status}</Text>

          </View>

        )}
      />

    </View>

  );

}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    padding: 20
  },

  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20
  },

  card: {
    padding: 15,
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    marginBottom: 10
  }

});