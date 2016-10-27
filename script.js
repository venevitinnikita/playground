/* global gantt X2JS */

window.onload = function () {
    gantt.config.autosize = "xy";
    gantt.config.scale_unit = "year";
    gantt.config.date_scale = "%Y";
    gantt.config.subscales = [
        { unit: "month", step: 1, date: "%M" }
    ];

    // gantt.config.scale_unit = "month";
    // gantt.config.date_scale = "%M";
    // gantt.config.subscales = [
    //     { unit: "day", step: 3, date: "%D" }
    // ];

    gantt.init("gantt_div");
    // gantt.load("content.xml", "xml");
    gantt.load("example-data.xml", "xml");

    // util.watch(gantt, '_pull');
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
    copyAttribute: function (from, to, attribute) {
        if (from[attribute]) to[attribute] = from[attribute];
    },
    copyAttributes: function (from, to, excludes) {
        for (var key in from) {
            if (excludes && excludes.includes(key)) {
                continue;
            }
            to[key] = from[key];
        }
    },
    watch: function (obj, prop, callback) {
        var origin = obj[prop];
        if (!callback) callback = function () {
            debugger;
        }
        Object.defineProperty(obj, prop, {
            get: function () {
                callback();
                return origin;
            },
            set: function (value) {
                callback();
                origin = value;
            }
        })
    },
    getDefined: function (obj, properties) {
        var result = null;
        properties.forEach(function (property) {
            if (obj[property]) result = obj[property];
        });
        return result;
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
    datagrid.columns.column.forEach(function (column, i) {
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
            return obj ? obj[attributeName] || '' : '';
        }

        gantt.config.columns[i] = ganttColumn;
    });

    // Всегда делаем первую колонку иерархической
    if (gantt.config.columns.length > 0)
        gantt.config.columns[0].tree = true;
}

function processResourceChart(resourceChart) {
    initCaptionTaskType();
    initTaskTextTemplate();
    initCaptionTaskRenderer();
    initCaptionTaskLayer();

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
                if (period._name === 'null' ||
                    ['transparent', 'transparent_group'].indexOf(period._style) >= 0) {
                    /* Такие периоды используются как заголовки в области задач */
                    period.type = gantt.config.types.caption;
                }
                periods.push(period);
            }
        });
        var subtasks = [];
        if (periods.length == 1) {
            period2task(periods[0], data);
        } else {
            periods.forEach(function (period) {
                data.type = gantt.config.types.caption;

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

                /* Это свойство будет проверяться при отрисовке таблицы:
                   для task'ов с этим свойством не будет добавляться строка */
                subtask.subtask = true;

                subtasks.push(subtask);
            });
        }

        datas.push(data);
        if (subtasks.length > 0) data.subtasks = subtasks;
    });

    return datas;
}

/* Для PRO версии */
function initCaptionTaskType() {
    gantt.config.types.caption = "caption";
    gantt.templates.task_class = function (start, end, task) {
        if (task.type == gantt.config.types.caption) {
            return "caption_task";
        }
        return "";
    };
}

function initCaptionTaskRenderer() {
    gantt.config.type_renderers[gantt.config.types.caption] = function () {
        return null;
    };
}

function initTaskTextTemplate() {
    gantt.templates.task_text = function (start, end, task) {
        var text = util.getDefined(task, ["sign", "signCenter"]);
        return text ? text : task.text;
    };
}

function initCaptionTaskLayer() {
    gantt.addTaskLayer(function (task) {
        if (task.type === gantt.config.types.caption) {
            var sizes = gantt.getTaskPosition(task, task.start, task.end);
            var el = document.createElement('div');
            el.className = "caption_row";
            el.innerText = task.text;
            el.style.left = sizes.left + 'px';
            el.style.top = sizes.top + 'px';
            el.style.width = sizes.width + 'px';
            el.style.height = sizes.height + 'px';

            return el;
        }
        return false;
    });
}

function period2task(period, task) {
    function copyAttribute(attribute) {
        util.copyAttribute(period, task, attribute);
    }

    var start_date_str = period._start.replaceAll(' ', 'T'); // to ISO 8601
    task.start_date = new Date(start_date_str);

    var end_date_str = period._end.replaceAll(' ', 'T'); // to ISO 8601
    task.end_date = new Date(end_date_str);

    copyAttribute('type');

    util.fillAttributes(period.attributes.attribute, task);
}

function processProjectChart() {
    // TODO
}