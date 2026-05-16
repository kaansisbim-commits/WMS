const getBaseUrl = () => {
    const { hostname } = window.location;
    return `http://${hostname}:8080/api`;
};

export const API_URL = getBaseUrl();

export const fetchApi = async (endpoint, options = {}) => {
    // If endpoint doesn't start with /wms or /admin, default to /wms
    const path = (endpoint.startsWith('/wms') || endpoint.startsWith('/admin')) 
        ? endpoint 
        : `/wms${endpoint}`;

    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer Admin123Token',
            ...options.headers,
        },
    });
    return response.json();
};
