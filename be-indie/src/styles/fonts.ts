import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/hanken-grotesk';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';

export async function fontsReady() {
  await Promise.all([
    document.fonts.load('900 100px "Archivo Variable"'),
    document.fonts.load('400 16px "Hanken Grotesk Variable"'),
    document.fonts.load('400 16px "IBM Plex Mono"'),
    document.fonts.load('500 16px "IBM Plex Mono"'),
    document.fonts.load('600 16px "IBM Plex Mono"'),
  ]);
  await document.fonts.ready;
}
