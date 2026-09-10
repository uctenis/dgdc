import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Renderiza un nodo del DOM (ya visible, tamaño carta) a un PDF paginado.
 * Pensado para actas y bases: el contenido se compone con HTML/Tailwind
 * y esta función solo lo "imprime" a PDF para adjuntar a firma digital.
 */
export async function generarPdfDesdeElemento(
  elemento: HTMLElement,
  nombreArchivo: string
): Promise<File> {
  const canvas = await html2canvas(elemento, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  const blob = pdf.output('blob');
  return new File([blob], nombreArchivo, { type: 'application/pdf' });
}
