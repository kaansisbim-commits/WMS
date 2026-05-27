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
                
                const schemaResult101 = await fetchApi('/design?scrid=101');
                const schemaResult102 = await fetchApi('/design?scrid=102');
                
                const screens = [];
                if (schemaResult101.success && schemaResult101.data) {
                    screens.push({
                        key: 'malKabul',
                        fields: schemaResult101.data.map(f => ({
                            ...f,
                            GuideMappingJSON: f.GuideMappingJSON ? JSON.parse(f.GuideMappingJSON) : []
                        }))
                    });
                }
                if (schemaResult102.success && schemaResult102.data) {
                    screens.push({
                        key: 'poMalKabul',
                        fields: schemaResult102.data.map(f => ({
                            ...f,
                            GuideMappingJSON: f.GuideMappingJSON ? JSON.parse(f.GuideMappingJSON) : []
                        }))
                    });
                }
                setFormSchema({ screens });
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
