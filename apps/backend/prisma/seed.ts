/**
 * SEED SCRIPT — Acme Finanzas
 * Limpia toda la BD (excepto usuarios) y carga ~30 días de datos de prueba.
 *
 * Ejecutar con:
 *   cd apps/backend
 *   npx tsx prisma/seed.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);
  return d;
}

async function main() {
  console.log('🧹 Limpiando base de datos (excepto usuarios)...');

  // Orden correcto respetando FK (movements → transactions → checks → boxes → clients)
  await prisma.movement.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.check.deleteMany({});
  await prisma.box.deleteMany({});
  await prisma.client.deleteMany({});

  console.log('✅ Limpieza completada.');

  // ── OBTENER USUARIO ADMIN ────────────────────────────────────────────────
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const userId = adminUser?.id ?? null;

  // ── CREAR CAJA DE LA AGENCIA ─────────────────────────────────────────────
  console.log('📦 Creando caja de agencia...');
  const agencyBox = await prisma.box.create({
    data: { name: 'Caja Principal' }
  });

  // ── CREAR CLIENTES + SUS CAJAS ───────────────────────────────────────────
  console.log('👥 Creando clientes...');
  const clientsData = [
    { name: 'Roberto Méndez',    tax_id: '20-31456789-4', email: 'roberto@gmail.com' },
    { name: 'Laura González',    tax_id: '27-28765432-1', email: 'laura@gmail.com' },
    { name: 'Carlos Suárez',     tax_id: '20-35678901-5', email: 'carlos@gmail.com' },
    { name: 'María Fernández',   tax_id: '27-29876543-2', email: 'maria@gmail.com' },
    { name: 'Alejandro Torres',  tax_id: '20-33456789-8', email: 'alejandro@gmail.com' },
  ];

  const clients: Record<string, { id: string; boxId: string }> = {};
  for (const cd of clientsData) {
    const client = await prisma.client.create({ data: cd });
    const box    = await prisma.box.create({ data: { name: `Cuenta — ${cd.name}`, client_id: client.id } });
    clients[cd.name] = { id: client.id, boxId: box.id };
  }

  const roberto   = clients['Roberto Méndez'];
  const laura     = clients['Laura González'];
  const carlos    = clients['Carlos Suárez'];
  const maria     = clients['María Fernández'];
  const alejandro = clients['Alejandro Torres'];

  console.log('💰 Generando transacciones...');

  // Helper para FX_TRADE (espeja lo que hace TransactionRepository.processFxTrade)
  async function fxTrade(
    operation: 'BUY' | 'SELL',
    usdAmount: number,
    exchangeRate: number,
    clientId: string,
    clientBoxId: string,
    description: string,
    date: Date
  ) {
    const arsAmount = usdAmount * exchangeRate;
    const tx = await prisma.transaction.create({
      data: {
        type: 'FX_TRADE',
        description,
        operation_date: date,
        exchange_rate: exchangeRate,
        created_by: userId,
      }
    });

    if (operation === 'BUY') {
      // Agencia recibe USD, entrega ARS
      await prisma.movement.createMany({ data: [
        { transaction_id: tx.id, box_id: agencyBox.id, type: 'DEBIT',  amount: usdAmount, currency: 'USD' },
        { transaction_id: tx.id, box_id: agencyBox.id, type: 'CREDIT', amount: arsAmount, currency: 'ARS' },
        { transaction_id: tx.id, box_id: clientBoxId,  type: 'CREDIT', amount: usdAmount, currency: 'USD', client_id: clientId },
        { transaction_id: tx.id, box_id: clientBoxId,  type: 'DEBIT',  amount: arsAmount, currency: 'ARS', client_id: clientId },
      ]});
    } else {
      // Agencia entrega USD, recibe ARS
      await prisma.movement.createMany({ data: [
        { transaction_id: tx.id, box_id: agencyBox.id, type: 'CREDIT', amount: usdAmount, currency: 'USD' },
        { transaction_id: tx.id, box_id: agencyBox.id, type: 'DEBIT',  amount: arsAmount, currency: 'ARS' },
        { transaction_id: tx.id, box_id: clientBoxId,  type: 'DEBIT',  amount: usdAmount, currency: 'USD', client_id: clientId },
        { transaction_id: tx.id, box_id: clientBoxId,  type: 'CREDIT', amount: arsAmount, currency: 'ARS', client_id: clientId },
      ]});
    }
    return tx;
  }

  async function income(
    amount: number, currency: 'ARS' | 'USD',
    description: string,
    category: string,
    date: Date,
    clientId?: string
  ) {
    const tx = await prisma.transaction.create({
      data: { type: 'INCOME', category: category as any, description, operation_date: date, created_by: userId }
    });
    await prisma.movement.create({
      data: { transaction_id: tx.id, box_id: agencyBox.id, type: 'DEBIT', amount, currency, client_id: clientId ?? null }
    });
    return tx;
  }

  async function outcome(
    amount: number, currency: 'ARS' | 'USD',
    description: string,
    category: string,
    date: Date
  ) {
    const tx = await prisma.transaction.create({
      data: { type: 'OUTCOME', category: category as any, description, operation_date: date, created_by: userId }
    });
    await prisma.movement.create({
      data: { transaction_id: tx.id, box_id: agencyBox.id, type: 'CREDIT', amount, currency }
    });
    return tx;
  }

  // ── HELPERS CHEQUES ─────────────────────────────────────────────────────
  // Ingreso de cheque a cartera (cliente trae cheque a la agencia)
  async function checkDeposit(
    check: { id: string; amount: any; currency: string },
    clientId: string,
    description: string,
    date: Date
  ) {
    const tx = await prisma.transaction.create({
      data: { type: 'CHECK_TRADE', category: 'CHECK_DEPOSIT', description, operation_date: date, created_by: userId }
    });
    await prisma.movement.create({
      data: { transaction_id: tx.id, box_id: null, client_id: clientId, check_id: check.id, type: 'DEBIT', amount: Number(check.amount), currency: check.currency }
    });
    return tx;
  }

  // Compraventa de cheque: vendedor cede cheque, comprador lo recibe; agencia intermedia (AP / AR)
  async function checkTrade(
    check: { id: string; amount: any; currency: string },
    sellerClientId: string,
    buyerClientId: string,
    description: string,
    date: Date
  ) {
    const tx = await prisma.transaction.create({
      data: { type: 'CHECK_TRADE', category: 'OTHER', description, operation_date: date, created_by: userId }
    });
    const amount = Number(check.amount);
    await prisma.movement.createMany({ data: [
      // Vendedor: cheque sale de su cuenta + agencia le debe ARS (AP)
      { transaction_id: tx.id, box_id: null, client_id: sellerClientId, check_id: check.id, type: 'CREDIT', amount, currency: check.currency },
      { transaction_id: tx.id, box_id: null, client_id: sellerClientId, check_id: null,     type: 'DEBIT',  amount, currency: 'ARS' },
      // Comprador: cheque entra a su cuenta + debe ARS a la agencia (AR)
      { transaction_id: tx.id, box_id: null, client_id: buyerClientId,  check_id: check.id, type: 'DEBIT',  amount, currency: check.currency },
      { transaction_id: tx.id, box_id: null, client_id: buyerClientId,  check_id: null,     type: 'CREDIT', amount, currency: 'ARS' },
    ]});
    return tx;
  }

  // Liquidación: comprador paga, posiciones bilaterales a cero
  async function checkSettle(
    check: { id: string; amount: any; currency: string },
    buyerClientId: string,
    sellerClientId: string | null,
    description: string,
    date: Date
  ) {
    const tx = await prisma.transaction.create({
      data: { type: 'CHECK_TRADE', category: 'OTHER', description, operation_date: date, created_by: userId }
    });
    const amount = Number(check.amount);
    const movData: any[] = [
      { transaction_id: tx.id, box_id: null, client_id: buyerClientId, check_id: check.id, type: 'CREDIT', amount, currency: check.currency },
      { transaction_id: tx.id, box_id: null, client_id: buyerClientId, check_id: null,     type: 'DEBIT',  amount, currency: 'ARS' },
    ];
    if (sellerClientId) {
      movData.push({ transaction_id: tx.id, box_id: null, client_id: sellerClientId, check_id: null, type: 'CREDIT', amount, currency: 'ARS' });
    }
    await prisma.movement.createMany({ data: movData });
    return tx;
  }

  // ── DÍA -30: CAPITAL INICIAL ─────────────────────────────────────────────
  await income(50_000_000, 'ARS', 'Aporte de capital inicial — socios', 'CAPITAL_CONTRIBUTION', daysAgo(30));
  await income(20_000,     'USD', 'Aporte de capital inicial USD — socios', 'CAPITAL_CONTRIBUTION', daysAgo(29));

  // ── DÍA -26: COMPRA USD (Roberto nos vende 10,000 USD) ───────────────────
  await fxTrade('BUY', 10_000, 1_150, roberto.id, roberto.boxId, 'Compra 10,000 USD — Roberto Méndez', daysAgo(26));

  // ── DÍA -24: VENTA USD (vendemos 8,000 USD a Laura) ─────────────────────
  await fxTrade('SELL', 8_000, 1_170, laura.id, laura.boxId, 'Venta 8,000 USD — Laura González', daysAgo(24));

  // ── DÍA -22: INGRESO PESOS (cliente trae efectivo) ───────────────────────
  await income(5_000_000, 'ARS', 'Ingreso efectivo — fondo operativo', 'CAPITAL_CONTRIBUTION', daysAgo(22));

  // ── DÍA -21: COMPRA USD (Carlos nos vende 15,000 USD) ───────────────────
  await fxTrade('BUY', 15_000, 1_160, carlos.id, carlos.boxId, 'Compra 15,000 USD — Carlos Suárez', daysAgo(21));

  // ── DÍA -18: GASTO SUELDOS ───────────────────────────────────────────────
  await outcome(1_200_000, 'ARS', 'Sueldos personal — Mes anterior', 'SALARY', daysAgo(18));

  // ── DÍA -16: VENTA USD (vendemos 12,000 a María) ────────────────────────
  await fxTrade('SELL', 12_000, 1_185, maria.id, maria.boxId, 'Venta 12,000 USD — María Fernández', daysAgo(16));

  // ── DÍA -14: INGRESO CHEQUE (Alejandro trae CHQ-000101, $800k) ────────────
  const check1 = await prisma.check.create({
    data: {
      check_number: 'CHQ-000101',
      bank_name: 'Banco Galicia',
      amount: 800_000,
      currency: 'ARS',
      issue_date: daysAgo(20),
      due_date:   daysAgo(-15),
      status: 'IN_PORTFOLIO',
      source_client_id: alejandro.id,
    }
  });
  await checkDeposit(check1, alejandro.id, 'Ingreso cheque CHQ-000101 — Alejandro Torres', daysAgo(14));

  // ── DÍA -12: COMPRAVENTA (agencia vende check1 a Roberto) ────────────────
  await checkTrade(check1, alejandro.id, roberto.id, 'C/V cheque CHQ-000101 — Alejandro Torres → Roberto Méndez', daysAgo(12));
  await prisma.check.update({ where: { id: check1.id }, data: { status: 'DELIVERED', destination_client_id: roberto.id } });

  // ── DÍA -10: LIQUIDACIÓN (Roberto acredita check1) ───────────────────────
  await checkSettle(check1, roberto.id, alejandro.id, 'Liquidación cheque CHQ-000101 — Roberto Méndez', daysAgo(10));
  await prisma.check.update({ where: { id: check1.id }, data: { status: 'DEPOSITED', destination_client_id: null, source_client_id: null } });

  // ── DÍA -13: COMPRA USD (Roberto nos vende 20,000 USD) ──────────────────
  await fxTrade('BUY', 20_000, 1_175, roberto.id, roberto.boxId, 'Compra 20,000 USD — Roberto Méndez', daysAgo(13));

  // ── DÍA -11: GASTO OPERATIVO ─────────────────────────────────────────────
  await outcome(500_000, 'ARS', 'Gastos operativos — alquiler y servicios', 'OPERATING_EXPENSE', daysAgo(11));

  // ── DÍA -10: INGRESO CLIENTES ────────────────────────────────────────────
  await income(10_000_000, 'ARS', 'Refuerzo de caja — aporte extraordinario', 'CAPITAL_CONTRIBUTION', daysAgo(10));

  // ── DÍA -8: GASTO SUELDOS ────────────────────────────────────────────────
  await outcome(2_500_000, 'ARS', 'Sueldos y cargas sociales', 'SALARY', daysAgo(8));

  // ── DÍA -7: VENTA USD (vendemos 25,000 a Laura) ─────────────────────────
  await fxTrade('SELL', 25_000, 1_195, laura.id, laura.boxId, 'Venta 25,000 USD — Laura González', daysAgo(7));

  // ── DÍA -5: COMPRA USD (Carlos nos vende 30,000 USD) ────────────────────
  await fxTrade('BUY', 30_000, 1_185, carlos.id, carlos.boxId, 'Compra 30,000 USD — Carlos Suárez', daysAgo(5));

  // ── DÍA -4: INGRESO CHEQUES (María trae check2 y check3) ─────────────────
  const check2 = await prisma.check.create({
    data: {
      check_number: 'CHQ-000202',
      bank_name: 'Banco Nación',
      amount: 700_000,
      currency: 'ARS',
      issue_date: daysAgo(10),
      due_date: daysAgo(-20),
      status: 'IN_PORTFOLIO',
      source_client_id: maria.id,
    }
  });
  const check3 = await prisma.check.create({
    data: {
      check_number: 'CHQ-000203',
      bank_name: 'Banco Nación',
      amount: 800_000,
      currency: 'ARS',
      issue_date: daysAgo(10),
      due_date: daysAgo(-25),
      status: 'IN_PORTFOLIO',
      source_client_id: maria.id,
    }
  });
  await checkDeposit(check2, maria.id, 'Ingreso cheque CHQ-000202 — María Fernández', daysAgo(4));
  await checkDeposit(check3, maria.id, 'Ingreso cheque CHQ-000203 — María Fernández', daysAgo(4));

  // ── DÍA -3: COMPRAVENTA (agencia vende check2 a Carlos, check3 queda en cartera) ──
  await checkTrade(check2, maria.id, carlos.id, 'C/V cheque CHQ-000202 — María Fernández → Carlos Suárez', daysAgo(3));
  await prisma.check.update({ where: { id: check2.id }, data: { status: 'DELIVERED', destination_client_id: carlos.id } });

  // ── DÍA -3: VENTA USD (vendemos 10,000 a Alejandro) ─────────────────────
  await fxTrade('SELL', 10_000, 1_200, alejandro.id, alejandro.boxId, 'Venta 10,000 USD — Alejandro Torres', daysAgo(3));

  // ── DÍA -2: INGRESO ──────────────────────────────────────────────────────
  await income(3_000_000, 'ARS', 'Ingreso comisiones — mes corriente', 'COMMISSION', daysAgo(2));

  // ── DÍA -1: RETIRO DE SOCIO ──────────────────────────────────────────────
  await outcome(1_800_000, 'ARS', 'Retiro de socio — distribución de utilidades', 'PARTNER_WITHDRAWAL', daysAgo(1));

  // ── CHECK ENTREGADO HISTÓRICO (referencia, sin movimientos pendientes) ────
  await prisma.check.create({
    data: {
      check_number: 'CHQ-000050',
      bank_name: 'Santander',
      amount: 500_000,
      currency: 'ARS',
      issue_date: daysAgo(40),
      due_date: daysAgo(5),
      status: 'DEPOSITED',
    }
  });

  // ── DÍA -7: INGRESO CHEQUE USD (Roberto trae CHQ-USD-001, $2000 USD) ─────
  const check5 = await prisma.check.create({
    data: {
      check_number: 'CHQ-USD-001',
      bank_name: 'HSBC',
      amount: 2_000,
      currency: 'USD',
      issue_date: daysAgo(8),
      due_date: daysAgo(-30),
      status: 'IN_PORTFOLIO',
      source_client_id: roberto.id,
    }
  });
  await checkDeposit(check5, roberto.id, 'Ingreso cheque USD CHQ-USD-001 — Roberto Méndez', daysAgo(7));

  // ── HOY: OPERACIONES DEL DÍA ─────────────────────────────────────────────
  const today = new Date();
  today.setHours(9, 30, 0, 0);

  // Venta USD hoy
  await fxTrade('SELL', 5_000, 1_210, roberto.id, roberto.boxId, 'Venta 5,000 USD — Roberto Méndez', today);

  const hoy2 = new Date(); hoy2.setHours(11, 15, 0, 0);
  await income(500_000, 'ARS', 'Ingreso efectivo ventanilla', 'CLIENT_FUNDING', hoy2);

  const hoy3 = new Date(); hoy3.setHours(14, 0, 0, 0);
  await outcome(250_000, 'ARS', 'Pago proveedor — insumos oficina', 'OPERATING_EXPENSE', hoy3);

  // Ingreso cheque hoy (María trae un cheque nuevo)
  const hoy4 = new Date(); hoy4.setHours(15, 30, 0, 0);
  const check6 = await prisma.check.create({
    data: {
      check_number: 'CHQ-000301',
      bank_name: 'Banco BBVA',
      amount: 1_000_000,
      currency: 'ARS',
      issue_date: new Date(),
      due_date: daysAgo(-30),
      status: 'IN_PORTFOLIO',
      source_client_id: maria.id,
    }
  });
  await checkDeposit(check6, maria.id, 'Ingreso cheque CHQ-000301 — María Fernández', hoy4);

  console.log('\n✅ Seed completado exitosamente.');
  console.log('\n📊 Resumen de datos cargados:');
  console.log(`   Cajas creadas:        ${await prisma.box.count()}`);
  console.log(`   Clientes creados:     ${await prisma.client.count()}`);
  console.log(`   Cheques creados:      ${await prisma.check.count()} (${await prisma.check.count({ where: { status: 'IN_PORTFOLIO' } })} en cartera)`);
  console.log(`   Transacciones:        ${await prisma.transaction.count()}`);
  console.log(`   Movimientos:          ${await prisma.movement.count()}`);
  console.log('\n   Breakdown por tipo:');
  for (const type of ['INCOME', 'OUTCOME', 'FX_TRADE', 'CHECK_TRADE', 'TRANSFER']) {
    const count = await prisma.transaction.count({ where: { type: type as any } });
    if (count > 0) console.log(`     ${type.padEnd(15)} ${count}`);
  }
}

main()
  .catch(e => { console.error('❌ Error en seed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
