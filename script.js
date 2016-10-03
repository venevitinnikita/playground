window.onload = function () {
    gantt.config.autosize = "xy";

    gantt.init("gantt_div");
    // gantt.load("content.xml", "xml");
    gantt.load("example-data.xml", "xml");
}

String.prototype.replaceAll = function (find, replacement) {
    return this.split(find).join(replacement);
}

var util = {
    checkedForEach: function (arr, func) {
        if (Array.isArray(arr)) {
            arr.forEach(func);
        } else if (arr) {
            func(arr, 0, null);
        }
    },
    untilTrue: function (arr, func) {
        if (Array.isArray(arr)) {
            arr.some(func);
        } else if (arr) {
            func(arr, 0, null);
        }
    },
    fillAttributes: function (arr, obj) {
        this.checkedForEach(arr, function (attribute, i, array) {
            obj[attribute._name] = attribute.__text;
        });
    },
    copyAttributes: function (from, to) {
        for (var key in from) {
            to[key] = from[key];
        }
    }
}

gantt.templates.tooltip_text = function (start, end, task) {
    return task.title;
}

var x2js = new X2JS();

gantt.xml.parse = function (text, loader) {
    /* Если в данных содержится запись с id == 0, то получим 
       бесконечную рекурсию (gantt.config.root_id == 0 по-умолчанию) */
    gantt.config.root_id = -1;

    var data = {};
    if (text.indexOf('anygant') < 0) {
        loader = this._getXML(text, loader);
        var evs = data.data = [];
        var xml = gantt.ajax.xpath("//task", loader);

        for (var i = 0; i < xml.length; i++)
            evs[i] = this._xmlNodeToJSON(xml[i]);

        data.collections = this._getCollections(loader);
    } else {
        var json = x2js.xml_str2json(text).anygantt;

        processDataGrid(json.datagrid);
        data.data = json.resource_chart ?
            processResourceChart(json.resource_chart) :
            processProjectChart(json.project_chart);

        // TODO
        data.collections = [];
    }

    return data;
}

function processDataGrid(datagrid) {
    gantt.config.columns = [];
    datagrid.columns.column.forEach(function (column, i, array) {
        var label = column.header.text;

        var ganttColumn = {};
        // TODO Пока в качестве name используется текст header`a
        ganttColumn.name = label.replaceAll(' ', '_');
        ganttColumn.label = label;
        if (column._width) ganttColumn.width = column._width;
        switch (column._cell_align) {
            // TODO разобраться с этим свойством
            case "LeftLevelPadding":
            case "Left":
                ganttColumn.align = "left";
                break;
            case "Center":
                ganttColumn.align = "center";
                break;
            case "Right":
                ganttColumn.align = "right";
                break;
        }

        ganttColumn.template = function (obj) {
            var attributeName = column.format
                .replaceAll('{%', '').replaceAll('}', '');
            var value = obj[attributeName];
            return value || '';
        }

        gantt.config.columns[i] = ganttColumn;
    });

    // Всегда делаем первую колонку иерархической
    if (gantt.config.columns.length > 0)
        gantt.config.columns[0].tree = true;
}

function processResourceChart(resourceChart) {
    var datas = [];
    resourceChart.resources.resource.forEach(function (resource, i, array) {
        var data = {};
        data.id = resource._id;
        data.text = data.Name = resource._name;
        data.open = resource._expanded === 'true'
        if (resource._parent) data.parent = resource._parent;

        if (resource.attributes) {
            util.fillAttributes(resource.attributes.attribute, data);
        }

        var id = resource._id;
        var periods = [];
        util.checkedForEach(resourceChart.periods.period, function (period, i, arr) {
            if (period._resource_id === id) {
                var task = {};

                var start_date_str = period._start.replaceAll(' ', 'T') // to ISO 8601
                task.start_date = new Date(start_date_str);

                var end_date_str = period._end.replaceAll(' ', 'T') // to ISO 8601
                task.end_date = new Date(end_date_str);

                util.fillAttributes(period.attributes.attribute, task);
                periods.push(task);
            }
        });
        if (periods.length == 1) {
            util.copyAttributes(periods[0], data);
        } else {
            periods.forEach(function (period, i, arr) {
                /* TODO:
                    1. Рассчитывать min(start_date), max(end_date)
                    2. Создавать task с таким интервалом и "visibility: hidden;"
                    3. Создавать дочерние таски */
            });
        }

        datas[i] = data;
    });

    return datas;
}