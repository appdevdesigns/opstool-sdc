/**
 * Routes
 *
 * Use this file to add any module specific routes to the main Sails
 * route object.
 */


module.exports = {

  'get /opstool-sdc/sdc/info/:ren_id': 'opstool-sdc/SDCController.renInfo',
  
  'post /opstool-sdc/sdc/info/:ren_id': 'opstool-sdc/SDCController.emailInfo',

  'get /opstool-sdc/sdc/qrcode/:token_qr': 'opstool-sdc/SDCController.renQrCode'

};

