/**
 * Routes
 *
 * Use this file to add any module specific routes to the main Sails
 * route object.
 */


module.exports = {

  'get /opstool-sdc/sdc/myInfo': 'opstool-sdc/SDCUser.myInfo',
  'get /opstool-sdc/sdc/info/:ren_id': 'opstool-sdc/SDCUser.renInfo',
  'post /opstool-sdc/sdc/info/:ren_id': 'opstool-sdc/SDCUser.emailInfo',
  'get /opstool-sdc/sdc/qrcode/:token_qr': 'opstool-sdc/SDCUser.renQrCode',

  'get /opstool-sdc/sdc/report': 'opstool-sdc/SDCReports.teamsReport',
  'get /opstool-sdc/sdc/teamsReport': 'opstool-sdc/SDCReports.teamsReport',
  'get /opstool-sdc/sdc/appointmentsReport': 'opstool-sdc/SDCReports.appointmentsReport',
  'get /opstool-sdc/sdc/appointmentsReport2': 'opstool-sdc/SDCReports.appointmentsReport2',
  'get /opstool-sdc/sdc/appointmentsReportData': 'opstool-sdc/SDCReports.appointmentsReportData',
  
};

