/**
 * SDCAppointment
 * @module      :: Model
 */

var async = require('async');
var _ = require('lodash');

module.exports = {
    
    tableName: 'sdc_appointment',
    
    autoCreatedAt: false,
    autoUpdatedAt: false,
    autoPK: false,
    migrate: 'alter',
    
    attributes: {
        id: {
            type: 'integer',
            size: 11,
            primaryKey: true,
            autoIncrement: false
        },
        
        date: {
            type: 'datetime',
        },
        
        session: {
            type: 'integer',
            size: 11
        },
        
        users: {
            collection: 'sdcuserappointment',
            via: 'appointment'
        }
    },
    
    ////
    //// Life cycle callbacks
    ////
    
    
    
    ////
    //// Model class methods
    ////
    
    
    /**
     * @param {Array} list
     * @return {Promise}
     */
    importData: function(list) {
        return new Promise((resolve, reject) => {
            async.eachSeries(list, (row, next) => {
                
                SDCAppointment.query(`
                    REPLACE INTO sdc_appointment
                    SET
                        id = ?,
                        date = ?,
                        session = ?
                `, [row.id, (row.date + ' ' + row.time), row.session], (err) => {
                    if (err) next(err);
                    else next();
                });
                
            }, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },
    

};
