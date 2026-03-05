/**
 * Менеджер модулей парсеров
 * Управляет всеми модулями парсеров и запускает их циклично
 */

const { ParserModuleManager } = require('./ModuleManager');

class ParserManager {
    constructor() {
        this.moduleManager = new ParserModuleManager();
        this.modules = [];
        this.currentModuleIndex = 0;
        this.isRunning = false;
    }

    /**
     * Регистрация модулей
     */
    registerModules() {
        console.log('📋 Регистрация модулей парсеров...');
        
        // Получаем все модули из ModuleManager
        const moduleNames = this.moduleManager.getModules();
        this.modules = moduleNames.map(name => this.moduleManager.getModule(name));
        
        console.log(`✅ Зарегистрировано ${this.modules.length} модулей:`);
        this.modules.forEach((module, index) => {
            console.log(`   ${index + 1}. ${module.name}`);
        });
    }

    /**
     * Инициализация всех модулей
     */
    async initializeAll() {
        console.log('\n🚀 Инициализация всех модулей...');
        
        const results = await Promise.allSettled(
            this.modules.map(module => module.initialize())
        );
        
        const successful = results.filter(result => result.status === 'fulfilled' && result.value).length;
        const failed = results.length - successful;
        
        console.log(`✅ Инициализировано: ${successful}, ❌ Ошибок: ${failed}`);
        
        return successful > 0;
    }

    /**
     * Запуск циклического парсинга
     */
    async startCyclicParsing() {
        if (this.isRunning) {
            console.log('⚠️ Парсинг уже запущен');
            return;
        }

        this.isRunning = true;
        console.log('\n🔄 Запуск циклического парсинга...');
        
        try {
            while (this.isRunning) {
                const currentModule = this.modules[this.currentModuleIndex];
                
                if (!currentModule) {
                    console.log('❌ Модуль не найден, переходим к следующему');
                    this.nextModule();
                    continue;
                }

                console.log(`\n🎯 Текущий модуль: ${currentModule.name} (${this.currentModuleIndex + 1}/${this.modules.length})`);
                
                try {
                    const success = await currentModule.run();
                    if (success) {
                        console.log(`✅ Модуль ${currentModule.name} выполнен успешно`);
                    } else {
                        console.log(`⚠️ Модуль ${currentModule.name} завершился с ошибками`);
                    }
                } catch (error) {
                    console.error(`❌ Критическая ошибка в модуле ${currentModule.name}:`, error.message);
                }

                // Переходим к следующему модулю
                this.nextModule();
                
                // Пауза между модулями
                console.log('\n⏸️ Пауза между модулями (30 секунд)...');
                await this.sleep(30000);
            }
        } catch (error) {
            console.error('❌ Критическая ошибка в менеджере:', error.message);
        } finally {
            this.isRunning = false;
            console.log('\n🛑 Циклический парсинг остановлен');
        }
    }

    /**
     * Переход к следующему модулю
     */
    nextModule() {
        this.currentModuleIndex = (this.currentModuleIndex + 1) % this.modules.length;
    }

    /**
     * Остановка парсинга
     */
    stop() {
        console.log('\n🛑 Остановка парсинга...');
        this.isRunning = false;
    }

    /**
     * Получение статуса всех модулей
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            currentModule: this.modules[this.currentModuleIndex]?.name || 'None',
            currentIndex: this.currentModuleIndex,
            totalModules: this.modules.length,
            modules: this.modules.map(module => module.getInfo())
        };
    }

    /**
     * Запуск конкретного модуля
     */
    async runModule(moduleName) {
        const module = this.modules.find(m => m.name.toLowerCase() === moduleName.toLowerCase());
        
        if (!module) {
            console.error(`❌ Модуль ${moduleName} не найден`);
            return false;
        }

        console.log(`🎯 Запуск модуля ${module.name}...`);
        return await module.run();
    }

    /**
     * Утилита для паузы
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { ParserManager };
