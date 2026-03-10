import React from 'react';
import { TextInput } from 'react-native';

const DateTimeWrapper = ({ value, onChange, mode, display, ...props }) => {
    const handleChange = (event) => {
        const newVal = new Date(event.target.value);
        onChange(event, newVal);
    };

    return (
        <input
            type={mode === 'date' ? 'date' : 'time'}
            value={value instanceof Date ? value.toISOString().split('T')[0] : ''}
            onChange={handleChange}
            style={{
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #ccc',
                width: '100%'
            }}
        />
    );
};

export default DateTimeWrapper;
