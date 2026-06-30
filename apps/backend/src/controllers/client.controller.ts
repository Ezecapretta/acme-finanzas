import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { prisma } from '../db/prisma';
import { parseArgDate } from '../utils/dates';

export const getClients = async (req: Request, res: Response) => {
  try {
    const clients = await prisma.client.findMany({
      include: { box: true }
    });
    res.json(clients);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createClient = async (req: Request, res: Response) => {
  const { name, tax_id, email } = req.body;
  try {
    const client = await prisma.$transaction(async (tx: any) => {
      const newClient = await tx.client.create({
        data: { name, tax_id, email }
      });
      await tx.box.create({
        data: {
          name: `Caja - ${name}`,
          client_id: newClient.id
        }
      });
      return newClient;
    });
    res.status(201).json(client);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getClientById = async (req: Request, res: Response) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        box: true,
        source_checks: true,
        destination_checks: { where: { status: 'DELIVERED' }, include: { source_client: true } },
        movements: { include: { transaction: true, box: true }, orderBy: { created_at: 'desc' } }
      }
    });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const exportClientPDF = async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const fromDate = from ? parseArgDate(from) : undefined;
    const toDate = to ? parseArgDate(to) : undefined;
    const endOfDay = toDate ? new Date(toDate) : undefined;
    if (endOfDay) endOfDay.setHours(23, 59, 59, 999);

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        box: true,
        source_checks: true,
        movements: { include: { transaction: true, box: true }, orderBy: { created_at: 'asc' } }
      }
    });
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const logoPath = path.resolve(process.cwd(), '../frontend/public/image.png');
    let finalLogoPath = logoPath;
    if (!fs.existsSync(finalLogoPath)) {
        finalLogoPath = path.resolve(__dirname, '../../../frontend/public/image.png');
    }
    const logoExists = fs.existsSync(finalLogoPath);

    const doc = new PDFDocument({ size: 'A4', margin: 30, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', (err: Error) => { throw err; });

    if (logoExists) {
      doc.rect(30, 30, 120, 110).lineWidth(0.5).stroke('#000000');
      doc.image(finalLogoPath, 35, 35, { fit: [110, 100], align: 'center', valign: 'center' });
    }

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#000000').text('Resumen de Cuenta', 180, 40, { width: 380, align: 'center' });
    doc.moveTo(180, 65).lineTo(560, 65).lineWidth(1).strokeColor('#000000').stroke();

    const metadataX = 180;
    const metadataY = 85;
    
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text('Cliente:', metadataX, metadataY);
    doc.font('Helvetica').fontSize(10).fillColor('#000000').text(client.name, metadataX + 80, metadataY);
    
    const formatDate = (date: Date) => {
      // Forzar formato dd/mm/yyyy
      return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text('Fecha Desde:', metadataX, metadataY + 25);
    doc.font('Helvetica').fontSize(10).fillColor('#000000').text(fromDate ? formatDate(fromDate) : '-', metadataX + 80, metadataY + 25);
    
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text('Fecha Hasta:', metadataX, metadataY + 50);
    doc.font('Helvetica').fontSize(10).fillColor('#000000').text(endOfDay ? formatDate(endOfDay) : '-', metadataX + 80, metadataY + 50);

    doc.y = 170;

    const formatNumber = (value: number) => value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const renderTable = (title: string, rows: string[][], totalLabel?: string, totalValue?: string) => {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000').text(title, 30, doc.y);
      doc.moveDown(0.5);
      const startY = doc.y;
      const baseRowHeight = 16;
      const colWidths = [70, 100, 200, 80, 80];
      const headerHeight = 20;

      doc.fillColor('#e5e7eb').rect(30, startY, 530, headerHeight).fill();
      
      ['Fecha', 'Comprobante', 'Concepto', 'Importe', 'Saldo'].forEach((header, index) => {
        const x = 30 + colWidths.slice(0, index).reduce((acc, w) => acc + w, 0);
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000').text(header, x + 5, startY + 6, { width: colWidths[index] - 10, align: index >= 3 ? 'right' : 'left' });
      });

      let rowY = startY + headerHeight + 5;
      rows.forEach((row) => {
        // Evaluate maximum required height for this row
        let maxRowHeight = baseRowHeight;
        row.forEach((cell, i) => {
          const width = colWidths[i] - 10;
          const h = doc.font('Helvetica').fontSize(9).heightOfString(cell, { width, align: i >= 3 ? 'right' : 'left' });
          if (h > maxRowHeight) maxRowHeight = h;
        });

        // Add page if row won't fit
        if (rowY + maxRowHeight > 740) {
          doc.addPage();
          rowY = 40;
        }

        row.forEach((cell, i) => {
          const x = 30 + colWidths.slice(0, i).reduce((acc, w) => acc + w, 0);
          doc.font('Helvetica').fontSize(9).fillColor('#000000').text(cell, x + 5, rowY, { width: colWidths[i] - 10, align: i >= 3 ? 'right' : 'left' });
        });
        
        rowY += maxRowHeight + 5; // move below the wrapped text plus a small padding
      });

      if (totalLabel && totalValue) {
        doc.lineWidth(1.5).strokeColor('#000000').moveTo(350, rowY).lineTo(560, rowY).stroke();
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text(totalLabel, 350, rowY + 5, { width: 100, align: 'right' });
        doc.text(totalValue, 460, rowY + 5, { width: 100, align: 'right' });
        doc.moveDown(2);
      } else {
        doc.moveDown(2);
      }
      doc.y = Math.max(doc.y, rowY + 30);
    };

    const start = fromDate ? fromDate.getTime() : 0;
    const end = endOfDay ? endOfDay.getTime() : Infinity;

    const processLedger = (movs: any[]) => {
      let initialBalance = 0;
      let rollingBalance = 0;
      const rows: string[][] = [];

      for (const mov of movs) {
        const movTime = new Date(mov.created_at).getTime();
        const effect = mov.type === 'DEBIT' ? Number(mov.amount) : -Number(mov.amount);

        if (movTime < start) {
          initialBalance += effect;
          rollingBalance += effect;
        } else if (movTime <= end) {
          rollingBalance += effect;
          rows.push([
            formatDate(new Date(mov.created_at)),
            mov.transaction?.id ? mov.transaction.id.split('-')[0].toUpperCase() : '',
            mov.transaction?.description || '',
            formatNumber(effect),
            formatNumber(rollingBalance)
          ]);
        }
      }

      return { initialBalance, rows, closingBalance: rollingBalance };
    };

    // Deduplicación igual a la ficha del cliente en el frontend:
    // Por cada transacción+moneda, si hay movimiento con box_id usarlo; si no, usar el null-box.
    const deduplicateMovsByTx = (movs: any[]): any[] => {
      const byKey = new Map<string, any[]>();
      for (const m of movs) {
        const key = `${m.transaction_id || m.id}__${m.currency}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key)!.push(m);
      }
      return [...byKey.values()].flatMap(group => {
        const withBox = group.find((m: any) => m.box_id);
        if (withBox) return [withBox];
        return group;
      });
    };

    const checkMovs = client.movements.filter((m: any) => m.check_id);
    const arsMovs = deduplicateMovsByTx(client.movements.filter((m: any) => m.currency === 'ARS' && !m.check_id));
    const usdMovs = deduplicateMovsByTx(client.movements.filter((m: any) => m.currency === 'USD' && !m.check_id));

    const checkLedger = processLedger(checkMovs);
    const arsLedger = processLedger(arsMovs);
    const usdLedger = processLedger(usdMovs);

    if (checkLedger.rows.length > 0 || checkLedger.initialBalance !== 0) {
      const displayRows = [
        [fromDate ? formatDate(fromDate) : '', '', 'Saldo Inicial', '', formatNumber(checkLedger.initialBalance)],
        ...checkLedger.rows
      ];
      renderTable('Cheques', displayRows, 'Saldo Cheq.', formatNumber(checkLedger.closingBalance));
    }

    if (arsLedger.rows.length > 0 || arsLedger.initialBalance !== 0) {
      const displayRows = [
        [fromDate ? formatDate(fromDate) : '', '', 'Saldo Inicial', '', formatNumber(arsLedger.initialBalance)],
        ...arsLedger.rows
      ];
      renderTable('ARS', displayRows, 'Saldo ARS', formatNumber(arsLedger.closingBalance));
    }

    if (usdLedger.rows.length > 0 || usdLedger.initialBalance !== 0) {
      const displayRows = [
        [fromDate ? formatDate(fromDate) : '', '', 'Saldo Inicial', '', formatNumber(usdLedger.initialBalance)],
        ...usdLedger.rows
      ];
      renderTable('USD', displayRows, 'Saldo USD', formatNumber(usdLedger.closingBalance));
    }

    doc.fontSize(8).fillColor('#64748b').text(`Impresión: ${formatDate(new Date())} ${new Date().toLocaleTimeString('es-AR')}`, 30, doc.page.height - 40, { align: 'right' });
    doc.end();

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="resumen-${client.name}.pdf"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const updateClient = async (req: Request, res: Response) => {
  const { name, tax_id, email } = req.body;
  try {
    const updatedClient = await prisma.client.update({
      where: { id: req.params.id },
      data: { name, tax_id, email }
    });
    res.json(updatedClient);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.status(400).json({ error: error.message });
  }
};
