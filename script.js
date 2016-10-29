/* global gantt */

window.onload = function () {
    gantt.config.autosize = "xy";
    gantt.config.scale_unit = "year";
    gantt.config.date_scale = "%Y";
    gantt.config.subscales = [
        { unit: "month", step: 1, date: "%M" }
    ];

    gantt.init("gantt_div");
    gantt.load("example-data.xml", "xml");
}