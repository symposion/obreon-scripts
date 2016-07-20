const Roll20 = require('roll20-wrapper');
const roll20 = new Roll20();
const Logger = require('roll20-logger');
const logger = new Logger('ObreonScripts', roll20);
const ObreonScripts = require('./obreon-scripts');
const makeMoon = require('./moon-maker');
const ClimateModel = require('./weather-handler');
const DiceRoller = require('./dice-roller');
const diceRoller = new DiceRoller(roll20);
const osherionWeather = require('./osherion-climate');
ClimateModel.registerClimateModel(osherionWeather, diceRoller, logger);
const os = new ObreonScripts(roll20, logger, makeMoon);
const Journal = require('./journal');
Journal.parseFromJSON = logger.wrapFunction('parseFromJSON', Journal.parseFromJSON, 'Journal');
roll20.logWrap = 'roll20';
logger.wrapModule(roll20);
logger.wrapModule(os);

roll20.on('ready', () => {
  os.registerEventHandlers();
});

