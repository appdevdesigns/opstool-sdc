/**
 * Routes
 *
 * Use this file to add any module specific routes to the main Sails
 * route object.
 */


module.exports = {


  /*

  '/': {
    view: 'user/signup'
  },
  '/': 'opstool-sdc/PluginController.inbox',
  '/': {
    controller: 'opstool-sdc/PluginController',
    action: 'inbox'
  },
  'post /signup': 'opstool-sdc/PluginController.signup',
  'get /*(^.*)' : 'opstool-sdc/PluginController.profile'

  */
  'get /opstool-sdc/sdc/info/:ren_id': 'opstool-sdc/SDCController.renInfo',
  
  'post /opstool-sdc/sdc/info/:ren_id': 'opstool-sdc/SDCController.emailInfo',

  'get /opstool-sdc/sdc/qrcode/:token_qr': 'opstool-sdc/SDCController.renQrCode'

};

