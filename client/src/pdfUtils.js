import html2canvas from 'html2canvas';

export const downloadScheduleAsPNG = async (elementId, filename = 'my-schedule.png') => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found`);
    return;
  }

  try {
    // Temporarily disable fixed height/scrolling and force a wider width for capture
    const originalStyle = element.style.cssText;
    const body = element.querySelector('.calendar-body');
    const originalBodyStyle = body ? body.style.cssText : '';
    
    // Force a wider, more readable layout for the image
    element.style.width = '1200px';
    element.style.maxWidth = 'none';
    
    if (body) {
      body.style.height = 'auto';
      body.style.overflow = 'visible';
    }

    const canvas = await html2canvas(element, {
      scale: 2, // 2x is plenty for 1200px width
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 1200, // Match the forced width
      onclone: (clonedDoc) => {
        const clonedEl = clonedDoc.getElementById(elementId);
        const clonedBody = clonedDoc.querySelector('.calendar-body');
        if (clonedEl) {
          clonedEl.style.width = '1200px';
          clonedEl.style.maxWidth = 'none';
        }
        if (clonedBody) {
          clonedBody.style.height = 'auto';
          clonedBody.style.overflow = 'visible';
        }
      }
    });

    // Restore original styles
    if (body) body.style.cssText = originalBodyStyle;
    element.style.cssText = originalStyle;

    const imgData = canvas.toDataURL('image/png');
    
    // Trigger download
    const link = document.createElement('a');
    link.download = filename;
    link.href = imgData;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
  } catch (error) {
    console.error('Error generating image:', error);
    throw error;
  }
};
