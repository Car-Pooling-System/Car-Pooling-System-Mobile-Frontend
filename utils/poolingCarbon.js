const DEFAULT_EMISSION_KG_PER_KM = 0.15;

function toRadians(value) {
    return (value * Math.PI) / 180;
}

function haversineDistanceKm(start, end) {
    const earthRadiusKm = 6371;
    const dLat = toRadians(end.lat - start.lat);
    const dLng = toRadians(end.lng - start.lng);
    const lat1 = toRadians(start.lat);
    const lat2 = toRadians(end.lat);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function getDistanceKm(ride) {
    const metricsDistance = Number(ride?.metrics?.totalDistanceKm || 0);
    if (Number.isFinite(metricsDistance) && metricsDistance > 0) return metricsDistance;

    const start = ride?.route?.start;
    const end = ride?.route?.end;
    const startLat = Number(start?.lat ?? start?.location?.coordinates?.[1]);
    const startLng = Number(start?.lng ?? start?.location?.coordinates?.[0]);
    const endLat = Number(end?.lat ?? end?.location?.coordinates?.[1]);
    const endLng = Number(end?.lng ?? end?.location?.coordinates?.[0]);

    if (
        Number.isFinite(startLat) &&
        Number.isFinite(startLng) &&
        Number.isFinite(endLat) &&
        Number.isFinite(endLng)
    ) {
        return Number(
            haversineDistanceKm({ lat: startLat, lng: startLng }, { lat: endLat, lng: endLng }).toFixed(2)
        );
    }

    return 0;
}

export function calculatePoolingCarbonSavedKg(ride = {}, options = {}) {
    const { includeCurrentRider = false, includeRequestedPassengers = false } = options;
    const distanceKm = getDistanceKm(ride);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;

    const activeStatuses = includeRequestedPassengers
        ? new Set(["requested", "confirmed"])
        : new Set(["confirmed"]);

    const passengersCount = Array.isArray(ride?.passengers)
        ? ride.passengers.filter((passenger) =>
            activeStatuses.has(String(passenger?.status || "").toLowerCase())
        ).length
        : 0;

    const seatTotalRaw = ride?.seats?.total;
    const seatAvailableRaw = ride?.seats?.available ?? ride?.seatsAvailable;
    const hasSeatData =
        seatTotalRaw !== undefined &&
        seatTotalRaw !== null &&
        seatAvailableRaw !== undefined &&
        seatAvailableRaw !== null;
    const seatTotal = Number(seatTotalRaw);
    const seatAvailable = Number(seatAvailableRaw);
    const seatsBooked =
        hasSeatData && Number.isFinite(seatTotal) && Number.isFinite(seatAvailable)
            ? Math.max(seatTotal - seatAvailable, 0)
            : 0;

    let riders = Math.max(passengersCount, seatsBooked);
    if (includeCurrentRider) riders = Math.max(riders, 1);

    const travellers = 1 + riders; // driver + riders
    if (travellers <= 1) return 0;

    const separateCarsEmissionKg = travellers * distanceKm * DEFAULT_EMISSION_KG_PER_KM;
    const pooledEmissionKg = distanceKm * DEFAULT_EMISSION_KG_PER_KM;
    const savedKg = separateCarsEmissionKg - pooledEmissionKg;

    return Number(Math.max(savedKg, 0).toFixed(2));
}
