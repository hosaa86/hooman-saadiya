const axios = require('axios');

const AQARA_ACCESS_KEY = '0c05914dfd8c6cc18acc1af9f8869865'; // Use environment variables for security
const AQARA_API_URL = 'https://api.aqara.com/v1/devices';

exports.handler = async function(event, context) {
    if (event.httpMethod === 'GET') {
        try {
            const response = await axios.get(`${AQARA_API_URL}/list`, {
                headers: { Authorization: `Bearer ${AQARA_ACCESS_KEY}` }
            });
            return {
                statusCode: 200,
                body: JSON.stringify(response.data),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to fetch devices' }),
            };
        }
    }

    if (event.httpMethod === 'POST') {
        const { deviceId, state } = JSON.parse(event.body);
        try {
            const response = await axios.post(`${AQARA_API_URL}/${deviceId}/toggle`, { state }, {
                headers: { Authorization: `Bearer ${AQARA_ACCESS_KEY}` }
            });
            return {
                statusCode: 200,
                body: JSON.stringify(response.data),
            };
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to toggle device' }),
            };
        }
    }

    return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
};