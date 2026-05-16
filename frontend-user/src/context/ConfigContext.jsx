import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchApi } from '../utils/api';

const ConfigContext = createContext();

export const ConfigProvider = ({ children }) => {
    const [params, setParams] = useState({});

    const [formSchema, setFormSchema] = useState({ screens: [] });
    const [user, setUser] = useState(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const paramResult = await fetchApi('/parameters');
                if (paramResult.success && Array.isArray(paramResult.data)) {
                    const paramObj = {};
                    paramResult.data.forEach(p => {
                        paramObj[p.key] = p.value;
                    });
                    setParams(paramObj);
                }
                
                const schemaResult = await fetchApi('/design?scrid=101'); 
                if (schemaResult.success && schemaResult.data) {
                    const parsedFields = schemaResult.data.map(f => ({
                        ...f,
                        GuideMappingJSON: f.GuideMappingJSON ? JSON.parse(f.GuideMappingJSON) : []
                    }));
                    setFormSchema({ screens: [{ key: 'malKabul', fields: parsedFields }] });
                }
            } catch (err) {
                console.error('Veriler yüklenemedi:', err);
            }
        };
        loadData();
    }, []);

    return (
        <ConfigContext.Provider value={{ params, setParams, user, setUser, formSchema, setFormSchema }}>
            {children}
        </ConfigContext.Provider>
    );
};

export const useConfig = () => useContext(ConfigContext);
