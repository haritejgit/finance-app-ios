import { generatePlainTextStatement } from './src/exports';

const periodStartStr = '01/01/2023';
const periodEndStr = '31/01/2023';
const bf = 10000;
const transactions = [
  {date: 1672531200000, type: 'EXPENSE' as const, desc: 'Very long description that exceeds width', amount: 12345},
];
const totals = {sumInvs:0,sumColls:0,sumLoans:0,sumExps:12345,netTotal:10000-12345};
const language = 'en';
const villageName = 'All Villages';

const output = generatePlainTextStatement(periodStartStr, periodEndStr, bf, transactions, totals, language, villageName);
console.log(output);
