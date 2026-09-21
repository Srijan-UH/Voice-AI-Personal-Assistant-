import { extractAllSlots, extractNameDeterministic, extractPhoneDeterministic, extractDateDeterministic, extractTimeDeterministic } from '../lib/slotExtractor.js';
import { validatePhone, validateName } from '../lib/validators.js';

const input = 'Eight Seven Six Two Double Four Double Two Nine';
console.log('extractAllSlots:', extractAllSlots(input));
console.log('validatePhone:', validatePhone(input));
console.log('validateName:', validateName(input));
console.log('extractName:', extractNameDeterministic(input));
console.log('extractPhone:', extractPhoneDeterministic(input));
console.log('extractDate:', extractDateDeterministic(input));
console.log('extractTime:', extractTimeDeterministic(input));
