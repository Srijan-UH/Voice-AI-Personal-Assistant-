import { validatePhone } from '../lib/validators.js';

const input1 = 'Eight Seven Six Two Double Four Double Two Nine';
const input2 = 'Eight Seven Six Two Double Four Double Two Nine Seven';

console.log('9 digits:', validatePhone(input1));
console.log('10 digits:', validatePhone(input2));
