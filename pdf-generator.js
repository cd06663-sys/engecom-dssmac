const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, 'public', 'img', 'logo.png');

function generatePDF(data, outputPath) {
  return new Promise((resolve, reject) => {
    const { session, team, employees = [], instructor } = data;

    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const W  = 595.28;
    const ML = 25;
    const MT = 18;
    const CW = W - ML * 2;
    const rowsPerPage = 31;
    const pages = [];

    if (employees.length === 0) {
      pages.push([]);
    } else {
      for (let i = 0; i < employees.length; i += rowsPerPage) {
        pages.push(employees.slice(i, i + rowsPerPage));
      }
    }

    pages.forEach((pageEmployees, pageIndex) => {
      doc.addPage({ size: 'A4', margin: 0 });
      drawPage(doc, {
        session,
        team,
        employees: pageEmployees,
        instructor,
        globalStart: pageIndex * rowsPerPage,
        pageIndex,
        pageCount: pages.length,
        rowsPerPage,
        ML,
        MT,
        CW,
      });
    });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

function drawPage(doc, ctx) {
  const { session, team, employees, instructor, globalStart, pageIndex, pageCount, rowsPerPage, ML, MT, CW } = ctx;
  let y = MT;

  const logoW = 115;
  const headerH = 44;
  doc.rect(ML, y, logoW, headerH).lineWidth(0.5).stroke('#000');

  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, ML + 3, y + 4, { fit: [logoW - 6, headerH - 8] });
  } else {
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a3a6b').text('3E', ML + 5, y + 4);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1a3a6b').text('ENGECOM', ML + 4, y + 18);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#c0392b').text('5G', ML + 76, y + 4);
    doc.font('Helvetica').fontSize(5).fillColor('#555')
      .text('ENGENHARIA E COMÉRCIO', ML + 4, y + 32, { width: logoW - 8, align: 'center' });
  }

  doc.rect(ML + logoW, y, CW - logoW, headerH).lineWidth(0.5).stroke('#000');
  doc.font('Helvetica-Bold').fontSize(17).fillColor('#000')
    .text('Lista de Frequência', ML + logoW, y + 13, { width: CW - logoW, align: 'center' });
  if (pageCount > 1) {
    doc.font('Helvetica').fontSize(6.5)
      .text(`Página ${pageIndex + 1}/${pageCount}`, ML + logoW, y + 31, { width: CW - logoW, align: 'center' });
  }
  y += headerH;

  const infoH = 18;
  const c1W = Math.floor(CW * 0.65);
  const c2W = CW - c1W;
  const infoRow = (label1, val1, label2, val2) => {
    doc.rect(ML, y, c1W, infoH).lineWidth(0.5).stroke('#000');
    doc.rect(ML + c1W, y, c2W, infoH).lineWidth(0.5).stroke('#000');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000').text(label1, ML + 3, y + 5);
    const lw1 = doc.widthOfString(label1);
    doc.font('Helvetica').fontSize(7.5).fillColor('#000')
      .text(val1 || '', ML + 3 + lw1 + 2, y + 5, { width: c1W - lw1 - 8, ellipsis: true });
    doc.font('Helvetica-Bold').fontSize(7.5).text(label2, ML + c1W + 3, y + 5);
    const lw2 = doc.widthOfString(label2);
    doc.font('Helvetica').fontSize(7.5)
      .text(val2 || '', ML + c1W + 3 + lw2 + 2, y + 5, { width: c2W - lw2 - 8, ellipsis: true });
    y += infoH;
  };

  const teamLabel = `${team.name}${team.district_name ? ' - ' + team.district_name : ''}`;
  infoRow('Equipe:', teamLabel, 'Data:', formatDate(session.date));
  infoRow('Local do Treinamento:', team.district_city || '', 'Horário:', `${session.time_start || '07:00'} às ${session.time_end || '07:30'}`);
  infoRow('Instrutor:', instructor || '', 'Especialidade:', team.specialty || '');

  const actionW = Math.floor(CW * 0.8);
  const workW = CW - actionW;
  const actionH = 46;
  doc.rect(ML, y, actionW, actionH).lineWidth(0.5).stroke('#000');
  doc.rect(ML + actionW, y, workW, actionH).lineWidth(0.5).stroke('#000');
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000')
    .text('Ação Educacional: ', ML + 3, y + 3, { continued: true })
    .font('Helvetica')
    .text('Diálogo de Saúde, Segurança, Meio Ambiente e Comunidade - DSSMAC');
  const semanaLine = [
    session.week       ? `Semana ${session.week}` : '',
    session.month_year || '',
  ].filter(Boolean).join(' | ');
  doc.font('Helvetica-Bold').fontSize(7.5)
    .text(semanaLine, ML + 3, y + 14);

  if (session.description) {
    doc.font('Helvetica').fontSize(6.2).fillColor('#222')
      .text(`Descrição: ${session.description}`, ML + 3, y + 24, {
        width: actionW - 6,
        height: 18,
        ellipsis: true,
      });
  }

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000')
    .text('Carga Horária:', ML + actionW + 2, y + 8, { width: workW - 4, align: 'center' });
  doc.font('Helvetica').fontSize(8)
    .text(session.workload || '00h 30m', ML + actionW + 2, y + 22, { width: workW - 4, align: 'center' });
  y += actionH;

  const obraH = 16;
  doc.rect(ML, y, CW, obraH).lineWidth(0.5).stroke('#000');
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000')
    .text(`OBRA E VALE ${session.obra_vale || '11 5900130281'}`, ML + 3, y + 4);
  y += obraH;

  const cols = [
    { label: 'Nº',            w: 22 },
    { label: 'CPF/MATRÍCULA', w: 63 },
    { label: 'NOME',          w: 168 },
    { label: 'FUNÇÃO',        w: 104 },
    { label: 'EMPRESA',       w: 60 },
    { label: 'ASSINATURA',    w: 0 },
  ];
  const fixedW = cols.slice(0, 5).reduce((s, c) => s + c.w, 0);
  cols[5].w = CW - fixedW;

  const tHdrH = 18;
  doc.rect(ML, y, CW, tHdrH).fillAndStroke('#d0d3d4', '#000');
  let cx = ML;
  for (const col of cols) {
    doc.rect(cx, y, col.w, tHdrH).lineWidth(0.5).stroke('#000');
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#000')
      .text(col.label, cx + 1, y + 5, { width: col.w - 2, align: 'center' });
    cx += col.w;
  }
  y += tHdrH;

  const rowH = 17;
  for (let i = 0; i < rowsPerPage; i++) {
    const emp = employees[i] || null;
    const rowY = y;
    if (i % 2 === 0) doc.rect(ML, rowY, CW, rowH).fillAndStroke('#f7f7f7', '#000');
    else doc.rect(ML, rowY, CW, rowH).lineWidth(0.5).stroke('#000');

    const vals = emp
      ? [String(globalStart + i + 1), emp.matricula || '', emp.name || '', emp.function || '', emp.company || 'ENGECOM', '']
      : ['', '', '', '', '', ''];

    cx = ML;
    for (let j = 0; j < cols.length; j++) {
      doc.rect(cx, rowY, cols[j].w, rowH).lineWidth(0.5).stroke('#000');
      if (vals[j]) {
        const align = (j === 0 || j === 4) ? 'center' : 'left';
        doc.font('Helvetica').fontSize(6.5).fillColor('#000')
          .text(vals[j], cx + 2, rowY + 5, {
            width: cols[j].w - 4,
            height: rowH - 4,
            align,
            ellipsis: true,
          });
      }
      cx += cols[j].w;
    }
    y += rowH;
  }

  y += 12;
  const sigW = Math.floor(CW * 0.5);
  const sigH = 44;
  const sigX = ML + Math.floor((CW - sigW) / 2);
  doc.rect(sigX, y, sigW, sigH).lineWidth(0.5).stroke('#000');
  doc.font('Helvetica').fontSize(7).fillColor('#444')
    .text('Carimbo e assinatura do instrutor', sigX, y + 34, { width: sigW, align: 'center' });

  y += sigH + 8;
  doc.font('Helvetica').fontSize(6.5).fillColor('#666')
    .text(
      'ENGECOM ENGENHARIA E COMERCIO LTDA - CNPJ:16.594.889/0003-84 - AV. Santa Luzia, Quadra 57 S/N, Açailândia - MA',
      ML,
      y,
      { width: CW, align: 'center' }
    );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  if (dateStr instanceof Date) return dateStr.toLocaleDateString('pt-BR');
  const value = String(dateStr);
  const parts = value.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return value;
}

module.exports = { generatePDF };
