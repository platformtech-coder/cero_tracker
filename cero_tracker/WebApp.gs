/**
 * @file WebApp.gs
 * @description Web App entry point for CERO Tracker Dashboard.
 */

/* eslint-disable no-unused-vars */

// Logo embedded using the thumbnail endpoint to bypass recent Drive 3P cookie restrictions
const LOGO_DATA_URI = 'https://drive.google.com/thumbnail?id=1wXm6ayQTaYIcQm7UrLgf4ipuSZh59_2N&sz=w500';

function doGet(e) {
  try {
     const template = HtmlService.createTemplateFromFile('Index');
    template.navLogoB64 = LOGO_DATA_URI;
    return template.evaluate()
      .setTitle(CONFIG.WEB_APP_TITLE)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setSandboxMode(HtmlService.SandboxMode.IFRAME)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:Lexend,sans-serif;padding:60px;text-align:center;background:#0d1117;color:#f8fafc;min-height:100vh">' +
      '<h2>Dashboard Error</h2><p style="color:#94a3b8">' + err.message + '</p></div>'
    );
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
