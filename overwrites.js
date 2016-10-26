/* global gantt */

/**
 * Объект, который хранит дефолтные реализации функций
 */
var originals = {};

var tasksCount = 0;
gantt._sync_order_item = function (item, hidden) {
    if (item.id !== gantt.config.root_id) {  //do not trigger event for virtual root
        this._order_full.push(item.id);
        if (!hidden && this._filter_task(item.id, item) &&
            this.callEvent("onBeforeTaskDisplay", [item.id, item])) {
            this._order.push(item.id);
            if (!item.row) item.row = tasksCount++;
            this._order_search[item.id] = item.row;
        }
    }

    var children = this.getChildren(item.id);
    if (children) {
        for (var i = 0; i < children.length; i++)
            this._sync_order_item(this._pull[children[i]], hidden || !item.$open);
    }

    /* Дополнительная логика по обработке задач,
       расположенных на той же строке, что и текущая  */
    var subtasks = item.subtasks;
    if (subtasks) {
        for (var i = 0; i < subtasks.length; i++) {
            var subtask = subtasks[i];
            if (!subtask.row)
                subtask.row = tasksCount;
            this._sync_order_item(subtask, hidden || !item.$open);
            if (!this._pull[subtask.id])
                this._pull[subtask.id] = subtask;
        }
    }
};

//helper for rendering bars and links
gantt._task_renderer = function (id, render_one, node, filter) {
    //hash of dom elements is needed to redraw single bar/link
    if (!this._task_area_pulls)
        this._task_area_pulls = {};

    if (!this._task_area_renderers)
        this._task_area_renderers = {};

    if (this._task_area_renderers[id])
        return this._task_area_renderers[id];

    if (!render_one)
        this.assert(false, "Invalid renderer call");

    if (node)
        node.setAttribute(this.config.layer_attribute, true);

    this._task_area_renderers[id] = {
        render_item: function (item, container) {
            container = container || node;

            if (filter) {
                if (!filter(item)) {
                    this.remove_item(item.id);
                    return;
                }
            }

            var dom = render_one.call(gantt, item);

            /* Все подзадачи отрисовываются только в слое задач,
               остальные рендереры будут возвращать null (например,
               рендерер таблицы, так как в ней не должны появляться
               строки для подзадач), но если передать null в append,
               то задача удалится, поэтому делаем проверку */
            if (!dom && item.subtask) return;

            this.append(item, dom, container);
        },

        clear: function (container) {
            this.rendered = gantt._task_area_pulls[id] = {};
            this.clear_container(container);
        },
        clear_container: function (container) {
            container = container || node;
            if (container)
                container.innerHTML = "";
        },
        render_items: function (items, container) {
            container = container || node;

            var buffer = document.createDocumentFragment();
            this.clear(container);
            for (var i = 0, vis = items.length; i < vis; i++) {
                var item = items[i];
                if (this.node.className !== "gantt_bars_area" && item.subtask)
                    continue;
                this.render_item(item, buffer);
            }

            container.appendChild(buffer);
        },
        append: function (item, node, container) {
            if (!node) {
                if (this.rendered[item.id]) {
                    this.remove_item(item.id);
                }
                return;
            }

            if (this.rendered[item.id] && this.rendered[item.id].parentNode) {
                this.replace_item(item.id, node);
            } else {
                container.appendChild(node);
            }
            this.rendered[item.id] = node;

        },
        replace_item: function (item_id, newNode) {
            var item = this.rendered[item_id];
            if (item && item.parentNode) {
                item.parentNode.replaceChild(newNode, item);
            }
            this.rendered[item_id] = newNode;
        },
        remove_item: function (item_id) {
            this.hide(item_id);
            delete this.rendered[item_id];
        },
        hide: function (item_id) {
            var item = this.rendered[item_id];
            if (item && item.parentNode) {
                item.parentNode.removeChild(item);
            }
        },
        restore: function (item) {
            var dom = this.rendered[item.id];
            if (dom) {
                if (!dom.parentNode) {
                    this.append(item, dom, node);
                }
            } else {
                this.render_item(item, node);
            }
        },
        change_id: function (oldid, newid) {
            this.rendered[newid] = this.rendered[oldid];
            delete this.rendered[oldid];
        },
        rendered: this._task_area_pulls[id],
        node: node,
        unload: function () {
            this.clear();
            delete gantt._task_area_renderers[id];
            delete gantt._task_area_pulls[id];
        }
    };

    return this._task_area_renderers[id];
};

/* Подзадачи не должны отрисовываться в таблице */
originals._render_grid_item = gantt._render_grid_item;
gantt._render_grid_item = function (item) {
    if (item.subtask)
        return null;
    else
        return originals._render_grid_item.call(gantt, item);
}

gantt._render_bg_line = function (item) {
    if (item.subtask) return null;

    var cfg = gantt._tasks;
    var count = cfg.count;
    var row = document.createElement("div");
    /* Задачи со свойством transparent используется как заголовки в области задач,
       для них не отрисовываем ячейки */
    if (gantt.config.show_task_cells && !item.transparent) {
        for (var j = 0; j < count; j++) {
            var width = cfg.width[j],
                cssclass = "";

            if (width > 0) {//do not render skipped columns
                var cell = document.createElement("div");
                cell.style.width = (width) + "px";

                cssclass = "gantt_task_cell" + (j == count - 1 ? " gantt_last_cell" : "");
                cssTemplate = this.templates.task_cell_class(item, cfg.trace_x[j]);
                if (cssTemplate)
                    cssclass += " " + cssTemplate;
                cell.className = cssclass;

                row.appendChild(cell);
            }

        }
    }
    var odd = item.$index % 2 !== 0;
    var cssTemplate = gantt.templates.task_row_class(item.start_date, item.end_date, item);
    var css = "gantt_task_row" + (odd ? " odd" : "") + (cssTemplate ? ' ' + cssTemplate : '');

    if (this.getState().selected_task == item.id) {
        css += " gantt_selected";
    }

    //var row = "<div class='" + css + "' " + this.config.task_attribute + "='" + item.id + "'>" + cells.join("") + "</div>";

    row.className = css;

    if (gantt.config.smart_rendering) {
        row.style.position = "absolute";
        row.style.top = this.getTaskTop(item.id) + "px";
        row.style.width = "100%";
    }
    row.style.height = (gantt.config.row_height) + "px";
    row.setAttribute(this.config.task_attribute, item.id);
    return row;
};

gantt._calculate_content_height = function () {
    var scale_height = this.config.scale_height,
        hor_scroll_height = this._scroll_hor ? this.config.scroll_size + 1 : 0;

    if (!(this._is_grid_visible() || this._is_chart_visible())) {
        return 0;
    } else {
        /* Игнорируем подзадачи при рассчете высоты */
        var rows_count = 0, row_height = this.config.row_height;
        this._order.forEach(function (task_id) {
            if (!this._pull[task_id].subtask) rows_count++;
        }, this);
        var rows_height = rows_count * row_height;
        return scale_height + rows_height + 2 + hor_scroll_height;
    }
};