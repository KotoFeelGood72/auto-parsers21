const fs = require('fs');
const path = require('path');

/**
 * Менеджер модулей парсеров
 */
class ParserModuleManager {
    constructor() {
        this.modulesPath = path.join(__dirname, 'modules');
        this.modules = new Map();
        this.currentModuleIndex = 0;
        this.loadModules();
    }

    /**
     * Загрузка всех доступных модулей
     */
    loadModules() {
        try {
            const moduleDirs = fs.readdirSync(this.modulesPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            console.log(`🔍 Найдены модули: ${moduleDirs.join(', ')}`);

            for (const moduleName of moduleDirs) {
                try {
                    const modulePath = path.join(this.modulesPath, moduleName, 'index.js');
                    if (fs.existsSync(modulePath)) {
                        const ModuleClass = require(modulePath);
                        const moduleInstance = new ModuleClass[Object.keys(ModuleClass)[0]]();
                        this.modules.set(moduleName, moduleInstance);
                        console.log(`✅ Модуль ${moduleName} загружен`);
                    }
                } catch (error) {
                    console.error(`❌ Ошибка загрузки модуля ${moduleName}:`, error.message);
                }
            }

            console.log(`📊 Всего загружено модулей: ${this.modules.size}`);
        } catch (error) {
            console.error('❌ Ошибка загрузки модулей:', error.message);
        }
    }

    /**
     * Получение списка всех модулей
     */
    getModules() {
        return Array.from(this.modules.keys());
    }

    /**
     * Получение модуля по имени
     */
    getModule(name) {
        return this.modules.get(name);
    }

    /**
     * Получение следующего модуля в цикле
     */
    getNextModule() {
        const moduleNames = Array.from(this.modules.keys());
        if (moduleNames.length === 0) {
            return null;
        }

        const module = this.modules.get(moduleNames[this.currentModuleIndex]);
        this.currentModuleIndex = (this.currentModuleIndex + 1) % moduleNames.length;
        return module;
    }

    /**
     * Получение текущего модуля
     */
    getCurrentModule() {
        const moduleNames = Array.from(this.modules.keys());
        if (moduleNames.length === 0) {
            return null;
        }
        return this.modules.get(moduleNames[this.currentModuleIndex]);
    }

    /**
     * Проверка доступности всех модулей
     */
    async checkAvailability() {
        const results = {};
        for (const [name, module] of this.modules) {
            try {
                results[name] = await module.isAvailable();
            } catch (error) {
                results[name] = false;
                console.warn(`⚠️ Модуль ${name} недоступен:`, error.message);
            }
        }
        return results;
    }

    /**
     * Получение информации о всех модулях
     */
    getModulesInfo() {
        const info = {};
        for (const [name, module] of this.modules) {
            try {
                info[name] = module.getInfo();
            } catch (error) {
                info[name] = { name, error: error.message };
            }
        }
        return info;
    }

    /**
     * Запуск парсинга с циклическим переключением модулей
     */
    async* runCyclicParsing(maxIterations = null) {
        let iteration = 0;
        
        while (maxIterations === null || iteration < maxIterations) {
            const module = this.getNextModule();
            if (!module) {
                console.log('❌ Нет доступных модулей для парсинга');
                break;
            }

            console.log(`\n🔄 Итерация ${iteration + 1}: Запускаем модуль ${module.name}`);
            
            try {
                // Проверяем доступность модуля
                const isAvailable = await module.isAvailable();
                if (!isAvailable) {
                    console.log(`⚠️ Модуль ${module.name} недоступен, пропускаем`);
                    continue;
                }

                // Инициализируем парсер модуля
                if (module.parser && module.context) {
                    await module.parser.initialize(module.context);
                }
                
                // Запускаем парсинг
                let count = 0;
                for await (const listingUrl of module.getListings()) {
                    console.log(`\n🔍 Парсим объявление ${++count} из модуля ${module.name}: ${listingUrl}`);
                    
                    const data = await module.parseListing(listingUrl);
                    if (data) {
                        yield { module: module.name, data, url: listingUrl };
                    }
                    
                    // Ограничиваем количество объявлений за одну итерацию (убрано ограничение для полного парсинга)
                    // if (count >= 3) {
                    //     console.log(`✅ Обработано ${count} объявлений из модуля ${module.name}`);
                    //     break;
                    // }
                }
                
                console.log(`✅ Модуль ${module.name} завершен. Обработано ${count} объявлений`);
            } catch (error) {
                console.error(`❌ Ошибка в модуле ${module.name}:`, error.message);
            }

            iteration++;
            
            // Пауза между модулями
            if (maxIterations === null || iteration < maxIterations) {
                console.log('⏸️ Пауза между модулями...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
}

module.exports = { ParserModuleManager };
