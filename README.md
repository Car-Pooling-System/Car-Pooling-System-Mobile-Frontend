# Car Pooling Mobile Frontend

Welcome to the mobile frontend for the Car Pooling System. This application is built with **React Native** and **Expo**, providing a premium interface for both drivers and riders.

## Table of Contents

- [Core Technical Logic](#core-technical-logic)
  - [Geospatial Indexing (Grid System)](#geospatial-indexing-grid-system)
  - [Dynamic Price Calculation](#dynamic-price-calculation)
  - [Temporal Collision Detection](#temporal-collision-detection)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)

---

## Core Technical Logic

### Geospatial Indexing (Grid System)

To enable ultra-fast ride discovery without the computational overhead of O(N) distance calculations during searches, we implement a **Discretized Grid Indexing** system.

#### 1. Mathematical Projection

The continuous spherical coordinate space (Latitude $\phi$, Longitude $\lambda$) is projected onto a uniform discrete grid.

#### 2. Grid Function

Each coordinate is mapped to a unique grid identifier using the function:
$$G(\phi, \lambda) = \lfloor \frac{\phi}{s} \rfloor \text{\_} \lfloor \frac{\lambda}{s} \rfloor$$
Where:

- $\phi$: Latitude
- $\lambda$: Longitude
- $s$: Step size (constant $0.05 \approx 5.5\text{km}$ at the equator)

#### 3. Algorithmic Advantage

- **Index Generation**: When a ride is created, every point on the route's polyline is processed through $G$, creating a unique set of `gridsCovered`.
- **Search Complexity**: Search is reduced to a simple set-intersection problem ($S_{pickup} \in R_{grids} \land S_{drop} \in R_{grids}$), which is indexed in the database for **O(1)** or **O(log N)** lookup.

---

### Dynamic Price Calculation

The system employs a dual-layered pricing model to ensure fairness for both hosts and passengers.

#### 1. Host-Side Recommendation

The platform suggests a total ride price based on the total distance $D$ of the route:
$$P_{total} = B + (D \times R)$$
Where:

- $B = \text{₹}30$ (System Base Fare)
- $R = \text{₹}12/\text{km}$ (Platform Standard Rate)
- $D$: Total distance in kilometers

#### 2. Passenger Proportional Fare

When a rider joins for a specific segment $[p_{start}, p_{end}]$, their fare is calculated as a linear proportion of the total ride's value:
$$P_{passenger} = \left( \frac{D_{segment}}{D_{total}} \right) \times P_{ride\_total}$$
*Note: This ensures that the driver earns a consistent rate per km regardless of whether a passenger covers the full trip or a small section.*

---

### Temporal Collision Detection

To maintain schedule integrity, the system prevents drivers from hosting overlapping rides using the **Interval Overlap Lemma**.

#### 1. The Collision Condition

A collision occurs between a new ride interval $R_{new} = [S_{new}, E_{new}]$ and an existing scheduled ride $R_{ext} = [S_{ext}, E_{ext}]$ if and only if:
$$(S_{ext} < E_{new}) \land (E_{ext} > S_{new})$$
Where:

- $S$: Departure Time
- $E$: Expected Arrival Time ($S + \text{Duration}$)

#### 2. Optimization Constraint

The system enforces a global constraint for every driver $D$:
$$\forall R \in \text{ScheduledRides}_D : [S_{new}, E_{new}] \cap [S_R, E_R] = \emptyset$$
If this intersection is non-empty, the system returns a `409 Conflict` error to prevent double-booking the driver's time and vehicle.

---

## Tech Stack

- **Framework**: Expo / React Native
- **Styling**: Nativewind / Tailwind CSS
- **Maps**: Google Maps API (Marker, Polyline, Geocoding)
- **State Management**: React Hooks (useState, useEffect, useRef)
- **Auth**: Clerk Expo

---

## Project Structure

```
app/
├── (app)/
│   ├── \_layout.jsx       # Main Tab Navigation
│   ├── hosting/           # Ride Creation Flow
│   ├── my-rides/          # User's Trips (Rider/Driver)
│   └── profile/           # User Management
├── (auth)/                # Authentication Flow
└── index.jsx              # Landing Logic
```
