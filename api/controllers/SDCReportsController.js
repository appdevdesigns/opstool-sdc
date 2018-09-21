/**
 * SDCReportsController
 *
 * @description :: SDC reports
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */
var uuid = require('uuid/v4');

module.exports = {

    _config: {
 //       model: "sdcdata", // all lowercase model name
 //       actions: true,
 //       shortcuts: true,
 //       rest: true
    },
    
    
    // POST /opstool-sdc/SDCReports/feedback
    // 
    feedback: function(req, res) {
        var description = req.param('description');
        var imageDataUrl = req.param('screenshot'); // base64 data url
        var userAgent = req.param('userAgent') || '';
        var route = req.param('route') || '';
        var packageInfo = req.param('packageInfo') || {};
        var errorMessage = req.param('error') || ''; // screenshot error
        
        var attachments = [];
        var cid = uuid();
        var username = req.user.userModel.username;
        var email = req.user.userModel.email;
        
        var appVersion = packageInfo.version || '';
        var codePushLabel = packageInfo.label || '';
        
        // Attach screenshot if available
        var hasScreenshot = imageDataUrl && imageDataUrl.length;
        if (hasScreenshot) {
            var imageBase64 = imageDataUrl.substring(22);
            attachments.push({
                filename: 'screenshot.png',
                contents: Buffer.from(imageBase64, 'base64'),
                cid: cid
            });
        }
        
        // Render email
        sails.renderView(
            'opstool-sdc/feedback', // .ejs
            {
                description, userAgent, route, appVersion, codePushLabel,
                username, errorMessage, hasScreenshot,
                layout: false,
            },
            (err, html) => {
                
                if (err) {
                    console.log('Unable to render feedback html', err);
                    html = html || description;
                }
                
                EmailNotifications.send({
                    notify: {
                        id: 0,
                        emailSubject: 'ConneXted Feedback',
                        fromName: username || 'Username not found',
                        fromEmail: email || 'noreply@example.com',
                    },
                    recipients: sails.config.sdc.feedbackRecipients,
                    body: html,
                    attachments: attachments
                })
                .fail((err) => {
                    console.log(err);
                    res.AD.error(err);
                })
                .done(() => {
                    res.send('OK');
                });
            }
            
        );
        
    },
    
    
    // For debugging
    userList: function(req, res) {
        SDCData.generateSDCData(null, true)
        .then((data) => {
            res.send(data);
        })
        .catch((err) => {
            res.status(500).send(err.message || err);
        });
    },
    
    
    // Displays all SDC teams & users
    teamsReport: function(req, res) {
        
        SDCData.fetchTeams()
        .then((teams) => {
            if (!teams || !teams[0]) {
                throw new Error('No teams found');
            }
            else {
                var regions = [];
                var mccs = [];
                
                teams.forEach((team) => {
                    team.coachingPairs = SDCData.generateCoachingPairs(team);
                    
                    var region = team.region;
                    if (regions.indexOf(region) < 0) {
                        regions.push(region);
                    }
                    
                    var mcc = team.mcc;
                    if (mccs.indexOf(mcc) < 0) {
                        mccs.push(mcc);
                    }
                });
                
                regions.sort();
                mccs.sort();
                
                res.view('opstool-sdc/teamsReport', {
                    title: 'SDC teams report',
                    teams: teams,
                    regions: regions,
                    mccs: mccs
                });
            }
        })
        .catch((err) => {
            res.AD.error(err);
            console.log(err);
        });
    
    },
    
    
    appointmentsReport: function(req, res) {
        
        var startDate = req.param('startDate');
        var endDate = req.param('endDate');
        
        var teams, appointments;
        
        var bySession = {
        /*
            <session>: {
                confirmed: <int>,
                pending: <int>,
                requested: <int>,
                completed: <int>,
            },
            ...
        */
        };
        
        var byUser = {
        /*
            <sdc_guid>: {
                confirmed: <int>,
                pending: <int>,
                requested: <int>,
                completed: <int>,
            },
            ...
        */
        };
        
        var byStatus = {
        /*
            confirmed: <int>,
            pending: <int>,
            requested: <int>,
            completed: <int>,
        */
        };
        
        SDCData.fetchTeams()
        .then((teamList) => {
            teams = teamList;
            
            return SDCUserAppointment.findByDate(startDate, endDate)
        })
        .then((appointmentList) => {
            appointments = appointmentList;
            appointments.forEach((row) => {
                // Compile status counts
                bySession[row.session] = bySession[row.session] || {};
                bySession[row.session][row.status] = bySession[row.session][row.status] || 0;
                bySession[row.session][row.status] += 1;
                
                byUser[row.user] = byUser[row.user] || {};
                byUser[row.user][row.status] = byUser[row.user][row.status] || 0;
                byUser[row.user][row.status] += 1;
                
                byStatus[row.status] = byStatus[row.status] || 0;
                byStatus[row.status] += 1;
            });
            
            
            teams.forEach((team) => {
                team.appointments = {};
                
                // embed appointment status counts for each member
                team.members.forEach((member) => {
                    member.appointments = byUser[ member.sdc_guid ];
                    
                    // sum the count totals for the team
                    for (var status in member.appointments) {
                        team.appointments[status] = team.appointments[status] || 0;
                        team.appointments[status] += member.appointments[status];
                    }
                });
            });
            
            res.view('opstool-sdc/appointments', {
                title: 'SDC appointments report',
                teams: teams,
                appointments: appointments,
                byUser: byUser,
                byStatus: byStatus,
                bySession: bySession,
            });
            
        })
        .catch((err) => {
            console.log(err);
            res.serverError(err.message || err);
        });
    
    },
    
    appointmentsReport2: function(req, res) {
        res.view('opstool-sdc/appointments2', {
            title: 'SDC appointments report',
        });
    },
    
    
    appointmentsReportData: function(req, res) {
        var startDate = req.param('startDate');
        var endDate = req.param('endDate');
        
        var teams, appointments;
        
        // Array of status types
        var statuses = ['requested', 'pending', 'confirmed', 'completed', 'rejected'];
        
        var bySession = {
        /*
            <session>: {
                confirmed: <int>,
                pending: <int>,
                requested: <int>,
                completed: <int>,
            },
            ...
        */
        };
        
        var byUser = {
        /*
            <sdc_guid>: {
                confirmed: <int>,
                pending: <int>,
                requested: <int>,
                completed: <int>,
            },
            ...
        */
        };
        
        var byUserSession = {
        /*
            <sdc_guid>: {
                1: {
                    confirmed: <int>,
                    completed: <int>,
                    ...
                },
                2: { ... },
                3: { ... }
            },
            ...
        */
        };
        
        var byStatus = {
        /*
            confirmed: <int>,
            pending: <int>,
            requested: <int>,
            completed: <int>,
        */
        };
        
        SDCData.fetchTeams()
        .then((teamList) => {
            teams = teamList;
            
            return SDCUserAppointment.findByDate(startDate, endDate)
        })
        .then((appointmentList) => {
            appointments = appointmentList;
            appointments.forEach((row) => {
                // Compile status counts
                bySession[row.session] = bySession[row.session] || {};
                bySession[row.session][row.status] = bySession[row.session][row.status] || 0;
                bySession[row.session][row.status] += 1;
                
                byUser[row.user] = byUser[row.user] || {};
                byUser[row.user][row.status] = byUser[row.user][row.status] || 0;
                byUser[row.user][row.status] += 1;
                
                byStatus[row.status] = byStatus[row.status] || 0;
                byStatus[row.status] += 1;
                
                byUserSession[row.user] = byUserSession[row.user] || {};
                byUserSession[row.user][row.status] = {
                    1: 0,
                    2: 0,
                    3: 0,
                };
                byUserSession[row.user][row.status][row.session] += 1;
                
            });
            
            teams.forEach((team) => {
                team.appointments = {};
                
                // embed appointment status counts for each member
                team.members.forEach((member) => {
                    member.appointments = byUser[ member.sdc_guid ];
                    member.appointmentsBySession = byUserSession[ member.sdc_guid ];
                    
                    // sum the count totals for the team
                    statuses.forEach((status) => {
                        team.appointments[status] = team.appointments[status] || {
                            total: 0,
                            1: 0,
                            2: 0,
                            3: 0
                        };
                        for (var session=1; session<=3; session++) {
                            if (member.appointments && member.appointmentsBySession[status]) {
                                team.appointments[status].total += member.appointmentsBySession[status][session];
                                team.appointments[status][session] += member.appointmentsBySession[status][session];
                            }
                        }
                        
                    });
                });
            });
            
            
            var results = [];
            teams.forEach((team) => {
                var row = {
                    name: team.name,
                    region: team.region,
                    members: team.members.length,
                    appointments: team.appointments,
                    
                    confirmed1: team.appointments.confirmed[1],
                    completed1: team.appointments.completed[1],
                    
                    confirmed2: team.appointments.confirmed[2],
                    completed2: team.appointments.completed[2],
                    
                    confirmed3: team.appointments.confirmed[3],
                    completed3: team.appointments.completed[3],
                    
                    /*
                    rejected: team.appointments.rejected.total || 0,
                    requested: team.appointments.requested.total || 0,
                    pending: team.appointments.pending.total || 0,
                    confirmed: team.appointments.confirmed.total || 0,
                    completed: team.appointments.completed.total || 0,
                    */
                };
                results.push(row);
            });
            
            res.send(results);
            
        })
        .catch((err) => {
            console.log(err);
            res.serverError(err.message || err);
        });
    
    }
    
};

