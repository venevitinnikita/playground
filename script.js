/* global gantt X2JS */

window.onload = function () {
    gantt.config.autosize = "xy";
    gantt.config.scale_unit = "year";
    gantt.config.date_scale = "%Y";
    gantt.config.subscales = [
        { unit: "month", step: 1, date: "%M" }
    ];

    gantt.init("gantt_div");
    // gantt.load("content.xml", "xml");
    gantt.load("example-data.xml", "xml");
}

gantt.templates.tooltip_text = function (start, end, task) {
    return task.title;
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
    fillAttributes: function (arr, obj, excludes) {
        this.checkedForEach(arr, function (attribute) {
            if (excludes && excludes.includes(attribute._name)) {
                return;
            }
            obj[attribute._name] = attribute.__text;
        });
    },
    copyAttributes: function (from, to, excludes) {
        for (var key in from) {
            if (excludes && excludes.includes(key)) {
                continue;
            }
            to[key] = from[key];
        }
    }
}

var x2js = new X2JS();

gantt.xml.parse = function (text, loader) {
    var data = {};
    if (text.indexOf('anygant') < 0) {
        /* Стандартная реализация parse */
        loader = this._getXML(text, loader);
        var evs = data.data = [];
        var xml = gantt.ajax.xpath("//task", loader);

        for (var i = 0; i < xml.length; i++)
            evs[i] = this._xmlNodeToJSON(xml[i]);

        data.collections = this._getCollections(loader);
    } else {
        /* Если в данных содержится запись с id == 0, то получим 
           бесконечную рекурсию (gantt.config.root_id == 0 по-умолчанию) */
        gantt.config.root_id = -1;

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
    datagrid.columns.column.forEach(function (column) {
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
    resourceChart.resources.resource.forEach(function (resource) {
        var data = {};
        data.id = resource._id;
        data.text = data.Name = resource._name;
        data.open = resource._expanded === 'true';
        data.style = resource._style;
        if (resource._parent) data.parent = resource._parent;

        if (resource.attributes) {
            util.fillAttributes(resource.attributes.attribute, data);
        }

        var id = resource._id;
        var periods = [];
        util.checkedForEach(resourceChart.periods.period, function (period) {
            if (period._resource_id === id) {
                if (period._name !== 'null' &&
                    ['transparent'/*, 'transparent_group'*/].indexOf(period._style) < 0) {
                    periods.push(period);
                } else {
                    /* TODO такие периоды используются для обработки
                            клика по пустой области */
                }
            }
        });
        var subtasks = [];
        if (periods.length == 1) {
            period2task(periods[0], data);
        } else {
            periods.forEach(function (period) {
                var subtask = {};
                period2task(period, subtask);

                if (!data.start_date || subtask.start_date < data.start_date)
                    data.start_date = subtask.start_date;
                if (!data.end_date || subtask.end_date > data.end_date)
                    data.end_date = subtask.end_date;

                subtask.id = period._id;
                subtask.text = subtask.Name = '';
                subtask.parent = id;
                subtask.style = period._style;

                subtasks.push(subtask);
            });
        }

        datas.push(data);
        if (subtasks.length > 0) {
            // Array.prototype.push.apply(datas, subtasks);
            data.subtasks = subtasks;
        }
    });

    initMultitaskRendering();

    return datas;
}

function initMultitaskRendering() {
    gantt._sync_order_item = function (item, hidden, row) {
        if (item.id !== gantt.config.root_id) {  //do not trigger event for virtual root
            this._order_full.push(item.id);
            if (!hidden && this._filter_task(item.id, item) &&
                this.callEvent("onBeforeTaskDisplay", [item.id, item])) {
                this._order.push(item.id);
                this._order_search[item.id] = row ? row : this._order.length - 1;
            }
        }

        var children = this.getChildren(item.id);
        if (children) {
            for (var i = 0; i < children.length; i++)
                this._sync_order_item(this._pull[children[i]], hidden || !item.$open);
        }

        var subtasks = item.subtasks;
        if (subtasks) {
            for (var i = 0; i < subtasks.length; i++) {
                var subtask = subtasks[i];
                this._sync_order_item(subtask, hidden || !item.$open, this._order.length - 1);
            }
        }
    };
    gantt._build_pull = function (tasks) {
        var task = null,
            loaded = [];
        for (var i = 0, len = tasks.length; i < len; i++) {
            task = tasks[i];
            if (this._load_task(task))
                loaded.push(task);

            var subtasks = task.subtasks;
            if (subtasks) {
                for (var i = 0, len = subtasks.length; i < len; i++)
                    this._load_task(subtasks[i]);
            }
        }
        return loaded;
    };
}

function period2task(period, task) {
    var start_date_str = period._start.replaceAll(' ', 'T'); // to ISO 8601
    task.start_date = new Date(start_date_str);

    var end_date_str = period._end.replaceAll(' ', 'T'); // to ISO 8601
    task.end_date = new Date(end_date_str);

    util.fillAttributes(period.attributes.attribute, task);
}

function processProjectChart() {
    // TODO
}