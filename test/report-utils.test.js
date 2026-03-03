/**
 * Regression tests for report-utils: profit parsing, date filtering, fallback profit, multi-currency, null handling.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  parseNumberLoose,
  getNumericColumnValue,
  extractDate,
  isDateInRange,
  computeFinancials,
  getStatusLabel,
  EXCHANGE_RATE_RON_EUR
} = require('../report-utils.js');

describe('parseNumberLoose', () => {
  it('returns null for null, undefined, empty string', () => {
    assert.strictEqual(parseNumberLoose(null), null);
    assert.strictEqual(parseNumberLoose(undefined), null);
    assert.strictEqual(parseNumberLoose(''), null);
  });
  it('parses numeric strings and strips currency', () => {
    assert.strictEqual(parseNumberLoose('910'), 910);
    assert.strictEqual(parseNumberLoose('1 234.56'), 1234.56);
    assert.strictEqual(parseNumberLoose('1.234,56'), 1234.56);
    assert.strictEqual(parseNumberLoose('€ 100'), 100);
  });
  it('returns null for unparseable', () => {
    assert.strictEqual(parseNumberLoose('abc'), null);
    assert.strictEqual(parseNumberLoose('--'), null);
  });
  it('does not turn null into 0', () => {
    assert.strictEqual(parseNumberLoose(null), null);
    assert.notStrictEqual(parseNumberLoose(null), 0);
  });
});

describe('getNumericColumnValue', () => {
  it('formula with text="" value=null display_value="910" => 910', () => {
    const colValues = [
      { id: 'formula_mkre3gx1', type: 'formula', text: '', value: null, display_value: '910' }
    ];
    assert.strictEqual(getNumericColumnValue(colValues, 'formula_mkre3gx1'), 910);
  });
  it('formula with value JSON containing display_value', () => {
    const colValues = [
      { id: 'formula_mkre3gx1', text: '', value: '{"display_value":"150.5"}' }
    ];
    assert.strictEqual(getNumericColumnValue(colValues, 'formula_mkre3gx1'), 150.5);
  });
  it('missing column => null', () => {
    assert.strictEqual(getNumericColumnValue([], 'deal_value'), null);
    assert.strictEqual(getNumericColumnValue([{ id: 'other' }], 'deal_value'), null);
  });
  it('number column', () => {
    const colValues = [{ id: 'deal_value', number: 2000 }];
    assert.strictEqual(getNumericColumnValue(colValues, 'deal_value'), 2000);
  });
});

describe('extractDate', () => {
  it('value.date preferred', () => {
    const colValues = [{ id: 'deal_creation_date', value: '{"date":"2025-02-01"}' }];
    assert.strictEqual(extractDate(colValues, 'deal_creation_date'), '2025-02-01');
  });
  it('text YYYY-MM-DD HH:mm normalized to date', () => {
    const colValues = [{ id: 'deal_creation_date', text: '2025-02-15 14:30' }];
    assert.strictEqual(extractDate(colValues, 'deal_creation_date'), '2025-02-15');
  });
  it('invalid date => null', () => {
    const colValues = [{ id: 'deal_creation_date', text: 'not-a-date' }];
    assert.strictEqual(extractDate(colValues, 'deal_creation_date'), null);
  });
});

describe('isDateInRange', () => {
  it('date in range', () => {
    const r = isDateInRange('2025-02-10', '2025-02-01', '2025-02-28');
    assert.strictEqual(r.inRange, true);
    assert.strictEqual(r.invalid, false);
  });
  it('date outside range', () => {
    const r = isDateInRange('2025-03-01', '2025-02-01', '2025-02-28');
    assert.strictEqual(r.inRange, false);
  });
  it('missing date', () => {
    const r = isDateInRange(null, '2025-02-01', '2025-02-28');
    assert.strictEqual(r.missing, true);
  });
});

describe('computeFinancials', () => {
  it('does not use fallback profit when formula is missing', () => {
    const items = [
      {
        column_values: [
          { id: 'deal_value', number: 1000 },
          { id: 'numeric_mkpknkjp', number: 400 },
          { id: 'formula_mkre3gx1', text: '', value: null },
          { id: 'formula_mkxwd14p', display_value: '30' },
          { id: 'color_mkse3amh', label: 'EUR' }
        ]
      }
    ];
    const out = computeFinancials(items);
    assert.strictEqual(out.financials.total_profit_all, 0);
    assert.strictEqual(out.profit_from_fallback_count, 0);
    assert.strictEqual(out.profit_from_formula_count, 0);
    assert.strictEqual(out.profit_missing_count, 1);
  });
  it('formula profit used when present', () => {
    const items = [
      {
        column_values: [
          { id: 'deal_value', number: 1000 },
          { id: 'numeric_mkpknkjp', number: 400 },
          { id: 'formula_mkre3gx1', display_value: '650' },
          { id: 'formula_mkxwd14p', display_value: '65' },
          { id: 'color_mkse3amh', label: 'EUR' }
        ]
      }
    ];
    const out = computeFinancials(items);
    assert.strictEqual(out.financials.total_profit_all, 650);
    assert.strictEqual(out.profit_from_formula_count, 1);
  });
  it('profitability is average from formula_mkxwd14p', () => {
    const items = [
      {
        column_values: [
          { id: 'deal_value', number: 1000 },
          { id: 'formula_mkre3gx1', display_value: '200' },
          { id: 'formula_mkxwd14p', display_value: '20' },
          { id: 'color_mkse3amh', label: 'EUR' }
        ]
      },
      {
        column_values: [
          { id: 'deal_value', number: 500 },
          { id: 'formula_mkre3gx1', display_value: '100' },
          { id: 'formula_mkxwd14p', display_value: '40' },
          { id: 'color_mkse3amh', label: 'EUR' }
        ]
      }
    ];
    const out = computeFinancials(items);
    assert.strictEqual(out.financials.profitabilitate_ponderata, 30);
    assert.strictEqual(out.financials.valid_profitability_count, 2);
  });
  it('null never becomes 0 in sums', () => {
    const items = [
      {
        column_values: [
          { id: 'deal_value', number: 0 },
          { id: 'numeric_mkpknkjp' },
          { id: 'formula_mkre3gx1', text: '', value: null },
          { id: 'color_mkse3amh', label: 'EUR' }
        ]
      }
    ];
    const out = computeFinancials(items);
    assert.strictEqual(out.profit_missing_count, 1);
    assert.strictEqual(out.financials.valid_profit_count, 0);
    assert.strictEqual(out.financials.total_profit_all, 0);
  });
  it('multi-currency => financialsByCurrency separate', () => {
    const items = [
      {
        column_values: [
          { id: 'deal_value', number: 100 },
          { id: 'numeric_mkpknkjp', number: 60 },
          { id: 'formula_mkre3gx1', display_value: '40' },
          { id: 'formula_mkxwd14p', display_value: '40' },
          { id: 'color_mkse3amh', label: 'EUR' }
        ]
      },
      {
        column_values: [
          { id: 'deal_value', number: 500 },
          { id: 'numeric_mkpknkjp', number: 300 },
          { id: 'formula_mkre3gx1', display_value: '200' },
          { id: 'formula_mkxwd14p', display_value: '20' },
          { id: 'color_mkse3amh', label: 'RON' }
        ]
      }
    ];
    const out = computeFinancials(items);
    assert.strictEqual(out.mixedCurrencies, true);
    assert.ok(out.financialsByCurrency.EUR);
    assert.ok(out.financialsByCurrency.RON);
    assert.strictEqual(out.financialsByCurrency.EUR.total_profit, 40);
    assert.strictEqual(out.financialsByCurrency.RON.total_profit, 200);
    assert.strictEqual(out.financialsByCurrency.EUR.profitability, 40);
    assert.strictEqual(out.financialsByCurrency.RON.profitability, 20);
    // Global totals are normalized to EUR (RON converted by fixed rate).
    assert.ok(Math.abs(out.financials.total_pret_client - (100 + 500 / EXCHANGE_RATE_RON_EUR)) < 1e-9);
    assert.ok(Math.abs(out.financials.total_profit_all - (40 + 200 / EXCHANGE_RATE_RON_EUR)) < 1e-9);
    assert.strictEqual(out.financials.exchange_rate_ron_eur, EXCHANGE_RATE_RON_EUR);
  });
});

describe('getStatusLabel', () => {
  it('returns label when present', () => {
    const colValues = [{ id: 'color_mkse3amh', label: 'EUR' }];
    assert.strictEqual(getStatusLabel(colValues, 'color_mkse3amh'), 'EUR');
  });
  it('returns null for missing column', () => {
    assert.strictEqual(getStatusLabel([], 'x'), null);
  });
});
