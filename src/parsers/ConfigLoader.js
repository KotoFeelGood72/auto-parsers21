const fs = require('fs');
const path = require('path');

/**
 * Загрузчик конфигураций парсеров
 */
class ConfigLoader {
    constructor() {
        this.configsDir = path.join(__dirname, 'configs');
        this.configs = new Map();
        this.loadAllConfigs();
    }

    /**
     * Загрузка всех конфигураций из папки configs
     */
    loadAllConfigs() {
        try {
            if (!fs.existsSync(this.configsDir)) {
                console.warn(`⚠️ Папка конфигураций не найдена: ${this.configsDir}`);
                return;
            }

            const configFiles = fs.readdirSync(this.configsDir)
                .filter(file => file.endsWith('.json'));

            for (const file of configFiles) {
                const configName = path.basename(file, '.json');
                const configPath = path.join(this.configsDir, file);
                
                try {
                    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    this.configs.set(configName, configData);
                    console.log(`✅ Загружена конфигурация: ${configName}`);
                } catch (error) {
                    console.error(`❌ Ошибка загрузки конфигурации ${file}:`, error.message);
                }
            }
        } catch (error) {
            console.error("❌ Ошибка при загрузке конфигураций:", error);
        }
    }

    /**
     * Получение конфигурации по имени
     * @param {string} name - Имя конфигурации
     * @returns {Object|null} Конфигурация или null
     */
    getConfig(name) {
        return this.configs.get(name) || null;
    }

    /**
     * Получение списка доступных конфигураций
     * @returns {Array<string>} Массив имен конфигураций
     */
    getAvailableConfigs() {
        return Array.from(this.configs.keys());
    }


    /**
     * Объединение конфигураций
     * @param {Object} baseConfig - Базовая конфигурация
     * @param {Object} overrides - Переопределения
     * @returns {Object} Объединенная конфигурация
     */
    mergeConfigs(baseConfig, overrides) {
        const merged = { ...baseConfig };
        
        for (const [key, value] of Object.entries(overrides)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                merged[key] = { ...merged[key], ...value };
            } else {
                merged[key] = value;
            }
        }
        
        return merged;
    }

    /**
     * Добавление новой конфигурации
     * @param {string} name - Имя конфигурации
     * @param {Object} config - Конфигурация
     * @returns {boolean} true если добавлена успешно
     */
    addConfig(name, config) {
        try {
            this.configs.set(name, config);
            console.log(`✅ Добавлена конфигурация: ${name}`);
            return true;
        } catch (error) {
            console.error(`❌ Ошибка добавления конфигурации ${name}:`, error);
            return false;
        }
    }

    /**
     * Сохранение конфигурации в файл
     * @param {string} name - Имя конфигурации
     * @param {Object} config - Конфигурация
     * @returns {boolean} true если сохранена успешно
     */
    saveConfig(name, config) {
        try {
            const configPath = path.join(this.configsDir, `${name}.json`);
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
            this.configs.set(name, config);
            console.log(`✅ Конфигурация ${name} сохранена в файл`);
            return true;
        } catch (error) {
            console.error(`❌ Ошибка сохранения конфигурации ${name}:`, error);
            return false;
        }
    }

    /**
     * Удаление конфигурации
     * @param {string} name - Имя конфигурации
     * @returns {boolean} true если удалена успешно
     */
    removeConfig(name) {
        try {
            const configPath = path.join(this.configsDir, `${name}.json`);
            if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
            }
            this.configs.delete(name);
            console.log(`✅ Конфигурация ${name} удалена`);
            return true;
        } catch (error) {
            console.error(`❌ Ошибка удаления конфигурации ${name}:`, error);
            return false;
        }
    }

    /**
     * Получение информации о конфигурации
     * @param {string} name - Имя конфигурации
     * @returns {Object|null} Информация о конфигурации
     */
    getConfigInfo(name) {
        const config = this.getConfig(name);
        if (!config) return null;

        return {
            name: config.name,
            baseUrl: config.baseUrl,
            timeout: config.timeout,
            delayBetweenRequests: config.delayBetweenRequests,
            enableImageLoading: config.enableImageLoading,
            hasListingsSelectors: !!config.selectors?.listings,
            hasDetailsSelectors: !!config.selectors?.details,
            hasValidation: !!config.validation
        };
    }

    /**
     * Получение статистики по всем конфигурациям
     * @returns {Object} Статистика конфигураций
     */
    getStats() {
        const stats = {
            totalConfigs: this.configs.size,
            configs: []
        };

        for (const [name, config] of this.configs) {
            stats.configs.push({
                name: config.name,
                baseUrl: config.baseUrl
            });
        }

        return stats;
    }
}

// Создаем глобальный экземпляр загрузчика
const configLoader = new ConfigLoader();

module.exports = { ConfigLoader, configLoader };
