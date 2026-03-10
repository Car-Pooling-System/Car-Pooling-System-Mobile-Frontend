import React from 'react';
import { View, Text } from 'react-native';

const MapView = ({ children, style }) => (
    <View style={[{ backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' }, style]}>
        <Text style={{ color: '#4b5563', fontWeight: 'bold' }}>Map View (Web Preview)</Text>
        {children}
    </View>
);

const Marker = ({ children, coordinate }) => (
    <View style={{ position: 'absolute' }}>
        {children}
    </View>
);

const Polyline = () => null;
const PROVIDER_GOOGLE = 'google';
const PROVIDER_DEFAULT = 'default';

export default MapView;
export { Marker, Polyline, PROVIDER_GOOGLE, PROVIDER_DEFAULT };
