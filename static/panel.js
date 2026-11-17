import * as THREE from "three";
import { linkifyURLs, escapeHtml, isTouchDevice, isSafari, isVideoTopicStream } from "lib";

BigInt.prototype.toJSON = function () {
	return this.toString();
}; // fixes Bigint serialization issue in JSON.stringify

/**
 * This class represents a single panel of :doc:`PanelUI` and handles its user interface elements and user interactions.
 * Panel consists of the main widget area, can display raw message source, handles the menu, title bar, and optional extra buttons.
 * It also offers a mechanism to store and load custom variables used by the widgets.
 */
export class Panel {
	ui = null;

	/**
	 * Topic, Widget ID,  or Stream ID
	 * @type {string}
	 */
	id_source = null;
	/**
	 * ID of the media stream used by the panel
	 * @type {string|null} 
	 */
	id_stream = null;
	mid = null; // can't use trackIdentifier bcs Firefox overwrites it
	msg_type = null; //str
	msg_type_class = null;

	static PANEL_NO = 0;

	// msg_reader = null;
	max_height = 0;

	/**
	 * Reference to the panel's widget, :js:class:`SingleTypePanelWidgetBase` or :js:class:`CompositePanelWidgetBase`
	 * @type {SingleTypePanelWidgetBase | CompositePanelWidgetBase} 
	 */
	display_widget = null;
	grid_widget = null;

	initiated = false;
	init_data = null;
	// resizeEventHandler = null;
	/**
	 * True when raw message source is visible
	 * @type {boolean}
	 */
	src_visible = false;
	/**
	 * True when FPS label is visible
	 * @type {boolean} 
	 */
	fps_visible = false;
	show_fps_menu_label = "Show FPS";
	last_fps_updated = null;
	fps = 0;
	low_fps = 0;
	fps_frame_count = 0;
	fps_clear_timeout = null;
	fps_string = "";
	menu_extra_class = null;
	editing = false;
	//const event = new Event("build");

	/**
	 * True when panel is maximized
	 * @type {boolean}
	 */
	maximized = false;

	/**
	 * Panel number, useful for addressing panel's DOM elements (changes between page loads)
	 * @type {number}
	 */
	n = 0;

	/**
	 * True when panel is paused - no updates should be performed
	 * @type {boolean}
	 */
	paused = false;

	/**
	 * Reference to :js:class:`PanelUI`
	 * @type {PanelUI}
	 */
	ui = null;

	/**
	 * Height available to the widget in pixels
	 * @type {number}
	 */
	widget_height = 0;

	/**
	 * Width available to the widget in pixels
	 * @type {number}
	 */
	widget_width = 0;

	/**
	 * @param {string} id_source Topic, Widget ID, or Stream ID
	 * @param {PanelUI} ui :js:class:`PanelUI` reference
	 * @param {number} w Width in grid cells
	 * @param {number} h Height in grid cells
	 * @param {number} x Left in grid cells
	 * @param {number} y Top in grid cells
	 * @param {object} panel_vars Panel vars
	 */
	constructor(id_source, ui, w, h, x = null, y = null, panel_vars = {}) {
		this.ui = ui;
		let panels = ui.panels;
		let grid = ui.grid;

		this.id_source = id_source;

		this.paused = false;

		this.panel_vars = panel_vars;
		this.panel_vars_defaults = {};
		this.panelVarsUpdateTimer = null;

		// get common panel vars
		this.src_visible = this.getPanelVarAsBool('src', false);
		this.fps_visible = this.getPanelVarAsBool('fps', false);
		
		console.log("Panel created for " + this.id_source + " src_visible=" + this.src_visible + "; panel_vars=", this.panel_vars);

		this.floating_menu_top = null;

		this.n = Panel.PANEL_NO++;

		let title = "Loading...";
		if (id_source.indexOf('/') !== -1)
			title = id_source;

		let base_html = '<div class="grid_panel" id="grid_panel_' + this.n+  '" data-source="' + id_source + '">'
					  + '  <h3 class="panel-title" id="panel_title_' + this.n + '" title="' + id_source + '">' + title + '</h3>'
					  + '</div>';

		let grid_widget_opts = {
			w: w, h: h,
			minW: 1, minH: 4,
			content: base_html, // wrapper and handle el as html
			//<div class="cleaner"></div> ??
			lazyLoad: false
		};
		if (x != null && x != undefined) grid_widget_opts.x = x;
		if (y != null && y != undefined) grid_widget_opts.y = y;

		if (x == null && y == null) {
			x = 0;
			y = 0;
			for (let _x = 0; _x < 12 - w; _x++) {
				if (grid.isAreaEmpty(_x, y, w, h)) {
					x = _x;
					break;
				}
			}
			grid_widget_opts.x = x;
			grid_widget_opts.y = y;
		}

		panels[id_source] = this;

		console.log("Adding widget " + id_source + " w grid opts: ", grid_widget_opts);
		this.grid_widget = grid.addWidget(grid_widget_opts);
		$(this.grid_widget).addClass("loading");
		this.panel_el = $("#grid_panel_" + this.n);

		this.title_el = $('#panel_title_' + this.n);

		this.panel_content_space_el = $('<div class="panel_content_space" id="panel_content_space_' + this.n + '">');
		this.panel_content_space_el.appendTo(this.panel_el);

		this.menu_el = $('<div class="monitor_menu prevent-select" id="monitor_menu_' + this.n + '">');
		this.menu_content_el = $('<div class="monitor_menu_content" id="monitor_menu_content_' + this.n + '"></div>');
		this.menu_content_el.appendTo(this.menu_el);
		this.menu_el.appendTo(this.panel_el);

		let panel_btns_cont_el = $('<span class="panel_btns"><span class="panel-btns-gradient"></span></span>');
		this.panel_btns_el = $('<span class="panel-btns-content" id="panel_btns_' +this.n + '"></span>');
		this.panel_btns_el.appendTo(panel_btns_cont_el);
		panel_btns_cont_el.appendTo(this.panel_el);

		this.widget_el = $('<div class="panel_widget' + (this.src_visible ? ' source_visible' : '') + '" id="panel_widget_' + this.n + '"></div>');
		this.widget_el.appendTo(this.panel_content_space_el);

		this.source_el = $('<div class="panel_source' + (this.src_visible ? ' enabled' : '') + '" id="panel_source_' + this.n + '">Waiting for data...</div>');
		this.source_el.appendTo(this.panel_content_space_el);

		this.fps_el = $('<div class="panel_fps" id="panel_fps_' + this.n + '"></div>');
		this.fps_el.appendTo(this.panel_content_space_el);
		
		this.msg_types_el = null;
		// $('<div class="cleaner"></div>').appendTo(this.panel_el);

		if (id_source.indexOf('/') === 0) // topic widget
			this.ui.client.onTopicData(id_source, this.onDataContextWrapper);

		if (!this.edit_btn) {
			// pause panel updates
			this.edit_btn = $('<span id="edit_panel_' + this.n + '" class="edit-panel-button" title="Edit panel"></span>');
			this.edit_btn.appendTo(this.panel_btns_el);
		}

		let that = this;
		this.edit_btn.click(function (e) {
			let w = $(that.grid_widget);
			console.log("Edit clicked, editing=" + that.editing);
			if (!that.editing) {
				that.editing = true;
				w.addClass("editing");
				that.ui.grid.resizable(that.grid_widget, true);
				that.ui.grid.movable(that.grid_widget, true);
			} else {
				that.editing = false;
				w.removeClass("editing");
				that.ui.grid.resizable(that.grid_widget, false);
				that.ui.grid.movable(that.grid_widget, false);
			}

			e.cancelBubble = true;
			return false;
		});

		this.edit_timeout = null;
		this.title_el[0].addEventListener("touchstart", (ev) => {
			if (that.editing) return;
			console.log("Touch start " + id_source);
			that.edit_timeout = window.setTimeout(() => {
				if (!that.editing) {
					let w = $(that.grid_widget);
					that.editing = true;
					w.addClass("editing");
					that.ui.grid.resizable(that.grid_widget, true);
					that.ui.grid.movable(that.grid_widget, true);
				}
			}, 2000); // hold panel label for 2s to edit
		}, { passive: true });

		this.title_el[0].addEventListener('contextmenu', function(e) { // prevents android menu from showing 
			e.preventDefault();
			return false;
		}, false);

		this.title_el[0].addEventListener("touchend", () => {
			if (that.editing) return;
			if (that.edit_timeout) {
				window.clearTimeout(that.edit_timeout);
				that.edit_timeout = null;
			}
			console.log("Touch end " + id_source);
		}, { passive: true });

		this.last_content_space_click = null;
		this.maximized = false;

		this.panel_content_space_el[0].addEventListener("touchstart", (ev) => {
			if (that.editing) return;

			if (ev.touches.length != 1) {
				that.last_content_space_click = null;
				return;
			}

			if (that.last_content_space_click && Date.now() - that.last_content_space_click < 250) {
				that.last_content_space_click = null;
				that.maximize(!that.maximized);
				return;
			}

			that.last_content_space_click = Date.now();
		}, { passive: true });

		this.menu_el.on("click", () => {
			if (!isTouchDevice()) return;
			that.ui.panelMenuTouchToggle(that);
		});

		if (!isTouchDevice()) {
			this.menu_el.on("mouseenter", () => {
				this.menu_el.removeClass("hover_waiting");
			});
		}

		//prevent window scroll from closing this menu
		this.menu_content_el.on('touchmove', {passive: false}, (ev) => {
		    ev.stopPropagation();
		});

	}

	// init with message type when it's known
	// might get called with null gefore we receive the message type
	init(msg_type = null, update_panel_vars) {
		let fallback_show_src = true;

		if (!this.pause_el) {
			// pause panel updates
			this.pause_el = $('<span id="pause_panel_' + this.n + '" class="pause-panel-button" title="Waiting for data..."></span>');
			this.pause_el.insertBefore("#monitor_menu_" + this.n);
		}

		if (msg_type && !this.initiated && this.ui.config_received) {
			if (msg_type == 'video' || isVideoTopicStream(msg_type)) {
				this.fps_visible = this.getPanelVarAsBool('fps', true);
			}

			console.log("Initiating panel " + this.id_source + " for " + msg_type);

			// set w/h before widget constructors
			[this.widget_width, this.widget_height] = this.getAvailableWidgetSize();

			// composite widget (World Model 3D etc)
			if (this.ui.widgets[msg_type]) {

				if (!this.display_widget) { // only once
					this.display_widget = new this.ui.widgets[msg_type].class(
						this,
						null, // widget_css_class passed only to super 
						this.ui.widgets[msg_type].plugin_classes // world model plugins
					); //no data yet
					this.title_el.text(this.ui.widgets[msg_type].class.LABEL);
					fallback_show_src = false;
					this.source_el.addClass('widget_visible');
				}
			
			// type widgets
			} else {

				// widget by topic type
				this.msg_type = msg_type;
				if (msg_type != "video" && this.msg_types_el) {
					this.msg_type_class = this.ui.client.findMessageType(this.msg_type);
					const msg_type_link = this.msg_types_el.find('A').first();
					msg_type_link.html(this.msg_type ? this.msg_type : "");

					// if message type not loaded yet, wait for 3s, then display error
					if (this.msg_type_class == null) {
						
						let that = this;
						function delayedDisplayMessageTypeError() {
							msg_type_link.addClass("err");
							that.source_el.html('<span class="error">Message type ' + that.msg_type + " not loaded</span>");
						}
						let delayed_error_timeout = setTimeout(
							delayedDisplayMessageTypeError,
							3000,
						);
						function updateOnMessageTypesChanged() {
							that.msg_type_class = that.ui.client.findMessageType(that.msg_type);
							if (that.msg_type_class == null) return;
							clearTimeout(delayed_error_timeout);
							delayed_error_timeout = null;
							that.ui.client.off("defs_updated", updateOnMessageTypesChanged); //only once

							if (msg_type_link.hasClass('err')) {
								console.log("Redrawing panel for " + that.id_source);
								msg_type_link.removeClass("err");
								that.source_el.html("Waiting for data...");
							}
						}
						this.ui.client.on("defs_updated", updateOnMessageTypesChanged); // redraw on defs received
					}
				}

				if (!this.display_widget) { 
			
					// make widget by topic name
					if (this.ui.topic_widgets[this.id_source] != undefined) {
						console.log("Initiating display topic widget " + this.id_source, this.display_widget);
						// $('#display_panel_source_link_'+this.n).css('display', 'block');
						this.display_widget = new this.ui.topic_widgets[this.id_source].widget(
							this, // panel
							this.id_source, // topic
							null, // widget_css_class passed only to super 
							this.ui.type_widgets[this.msg_type].plugin_classes // video plugins
						); //no data yet
						fallback_show_src = false;
						this.source_el.addClass('widget_visible');
					
					// make widget by topic type
					} else if (this.ui.type_widgets[this.msg_type] != undefined) {
						console.log("Initiating display type widget " + this.id_source + " w " + this.msg_type, this.display_widget);
						// $('#display_panel_source_link_'+this.n).css('display', 'block');
						this.display_widget = new this.ui.type_widgets[this.msg_type].widget(
							this, // panel
							this.id_source, // topic
							null, // widget_css_class passed only to super 
							this.ui.type_widgets[this.msg_type].plugin_classes // video plugins
						); //no data yet
						fallback_show_src = false;
						this.source_el.addClass('widget_visible');
					}
				}

			}

			if (fallback_show_src) {
				this.src_visible = true;
			}

			if (this.src_visible) {
				//no widget, show source
				//console.error('no widget for '+this.id_source+" msg_type="+this.msg_type)
				$("#panel_source_" + this.n).addClass("enabled");
			}

			this.initiated = true;

			if (this.fps_visible) {
				this.updateFps();
				this.fps_el.addClass("enabled");
			}

			if (this.init_data != null) {
				this.onDataContextWrapper(this.init_data[0], this.init_data[1]);
				this.init_data = null;
			}
			
			if (update_panel_vars)
				this.ui.updateUrlHash();

			this.updateMenu();

			if (this.paused) {
				this.pause_el.addClass("paused");
				this.pause_el.attr("title", "Unpause");
				if (this.display_widget && this.display_widget.onPaused)
					this.display_widget.onPaused();
			} else {
				this.pause_el.removeClass("paused");
				this.pause_el.attr("title", "Pause");
			}
			let that = this;
			this.pause_el.click(function (e) {
				that.pauseToggle();
				e.cancelBubble = true;
				return false;
			});

			if (this.display_widget && this.display_widget.updateLoadingIcon) {
				this.display_widget.updateLoadingIcon();
			} else {
				$(this.grid_widget).removeClass("loading");
			}

		} else if (!this.initiated) {
			this.updateMenu(); //draw menu placeholder asap without the type
		}

		this.onResize();
	}

	/**
	 * Get panel variable as a boolean
	 * @param {string} var_name 
	 * @param {boolean} default_value 
	 * @returns {boolean}
	 */
	getPanelVarAsBool(var_name, default_value) {
		this.panel_vars_defaults[var_name] = default_value ? '1' : '0';
		if (this.panel_vars[var_name] === undefined)
			return default_value;
		return parseInt(this.panel_vars[var_name]) ? true : false;
	}

	/**
	 * Store panel variable as a boolean
	 * @param {string} var_name 
	 * @param {boolean} value 
	 */
	storePanelVarAsBool(var_name, value) {
		value = value ? '1' : '0';
		let change = this.panel_vars[var_name] !== value;
		if (value !== this.panel_vars_defaults[var_name])
			this.panel_vars[var_name] = value; 
		else delete this.panel_vars[var_name]; //remove if same as default
		if (change)
			this.storePanelVarsAsync();
	}

	/**
	 * Get panel variable as a integer
	 * @param {string} var_name 
	 * @param {number} default_value 
	 * @returns {number}
	 */
	getPanelVarAsInt(var_name, default_value) {
		this.panel_vars_defaults[var_name] = '' + default_value;
		return this.panel_vars[var_name] !== undefined ? parseInt(this.panel_vars[var_name]) : default_value;
	}

	/**
	 * Store panel variable as a integer
	 * @param {string} var_name 
	 * @param {number} value 
	 */
	storePanelVarAsInt(var_name, value) {
		value = '' + value;
		let change = this.panel_vars[var_name] !== value;
		if (value !== this.panel_vars_defaults[var_name])
			this.panel_vars[var_name] = value; 
		else delete this.panel_vars[var_name]; //remove if same as default
		if (change)
			this.storePanelVarsAsync();
	}

	/**
	 * Get panel variable as a float
	 * @param {string} var_name 
	 * @param {number} default_value 
	 * @returns {number}
	 */
	getPanelVarAsFloat(var_name, default_value) {
		this.panel_vars_defaults[var_name] = '' + default_value;
		return this.panel_vars[var_name] !== undefined ? parseFloat(this.panel_vars[var_name]) : default_value;
	}

	/**
	 * Store panel variable as a float, only *precision* decimal points are kept
	 * @param {string} var_name 
	 * @param {number} value 
	 * @param {number} precision = 3
	 */
	storePanelVarAsFloat(var_name, value, precision=3) {
		value = '' + value.toFixed(precision);
		let change = this.panel_vars[var_name] !== value;
		if (value !== this.panel_vars_defaults[var_name])
			this.panel_vars[var_name] = value; 
		else delete this.panel_vars[var_name]; //remove if same as default
		if (change)
			this.storePanelVarsAsync();
	}

	/**
	 * Get panel variable as a string
	 * @param {string} var_name 
	 * @param {string} default_value 
	 * @returns {string}
	 */
	getPanelVarAsString(var_name, default_value) {
		this.panel_vars_defaults[var_name] = '' + default_value;
		return this.panel_vars[var_name] !== undefined ? this.panel_vars[var_name] : default_value;
	}

	/**
	 * Store panel variable as a string
	 * @param {string} var_name 
	 * @param {string} value 
	 */
	storePanelVarAsString(var_name, value) {
		value = '' + value;
		let change = this.panel_vars[var_name] !== value;
		if (value !== this.panel_vars_defaults[var_name])
			this.panel_vars[var_name] = value; 
		else delete this.panel_vars[var_name];  //remove if same as default
		if (change)
			this.storePanelVarsAsync();
	}

	/**
	 * Get panel variable as an array of strings
	 * @param {string} var_name 
	 * @param {string[]} default_value 
	 * @returns {string[]}
	 */
	getPanelVarAsStringArray(var_name, default_value) {
		this.panel_vars_defaults[var_name] = default_value.join(',');
		if (this.panel_vars[var_name] === undefined)
			return default_value;
		let parts = this.panel_vars[var_name].split(",");
		if (parts.length < 1)
			return default_value;
		return parts;
	}
	
	/**
	 * Store panel variable as an array of strings
	 * @param {string} var_name 
	 * @param {string[]} value 
	 */
	storePanelVarAsStringArray(var_name, value) {
		value = value.join(',');
		let change = this.panel_vars[var_name] !== value;
		if (value !== this.panel_vars_defaults[var_name] && value != '')
			this.panel_vars[var_name] = value; 
		else delete this.panel_vars[var_name];  //remove if same as default
		if (change)
			this.storePanelVarsAsync();
	}

	/**
	 * Get panel variable as a THREE.Vector3
	 * @param {string} var_name 
	 * @param {THREE.Vector3} default_value 
	 * @returns {THREE.Vector3}
	 */
	getPanelVarAsVector3(var_name, default_value) {
		if (this.panel_vars[var_name] === undefined)
			return default_value;
		if (this.panel_vars[var_name].indexOf(',') <= 0) 
			return default_value;
		let coords = this.panel_vars[var_name].split(",");
		if (coords.length < 3)
			return default_value;
		return new THREE.Vector3(
			parseFloat(coords[0]),
			parseFloat(coords[1]),
			parseFloat(coords[2]),
		);
	}

	/**
	 * Store panel variable as a THREE.Vector3, only *precision* decimal points are kept
	 * @param {string} var_name 
	 * @param {THREE.Vector3} value 
	 * @param {number} precision = 3 
	 */
	storePanelVarAsVector3(var_name, value, precision=3) {
		value = value.x.toFixed(precision) + ',' + value.y.toFixed(precision) + ',' + value.z.toFixed(precision);
		let change = this.panel_vars[var_name] !== value;
		if (value !== this.panel_vars_defaults[var_name] && value != '')
			this.panel_vars[var_name] = value; 
		else delete this.panel_vars[var_name];  //remove if same as default
		if (change)
			this.storePanelVarsAsync();
	}

	/**
	 * Get panel variable as an array of floats
	 * @param {string} var_name 
	 * @param {number[]} default_value 
	 * @returns {number[]}
	 */
	getPanelVarAsFloatArray(var_name, default_value) {
		if (this.panel_vars[var_name] === undefined)
			return default_value;
		if (this.panel_vars[var_name].indexOf(',') < 0) 
			return default_value;
		let parts = this.panel_vars[var_name].split(",");
		if (parts.length < 1)
			return default_value;
		let ret = [];
		parts.forEach((p_str)=>{
			ret.push(parseFloat(p_str));
		});
		return ret;
	}

	/**
	 * Store panel variable as an array of floats, only *precision* decimal points are kept
	 * @param {string} var_name 
	 * @param {number[]} value 
	 * @param {number} precision 
	 */
	storePanelVarAsFloatArray(var_name, value, precision=3) {
		let s = value.map((x) => {
			if (x === '' || x === null)
				return '';
			else if (typeof x === 'string')
				return x;
			else
				return x.toFixed(precision);
		}).join(',');
		let change = this.panel_vars[var_name] !== s;
		if (s !== this.panel_vars_defaults[var_name] && s != '')
			this.panel_vars[var_name] = s; 
		else delete this.panel_vars[var_name];  //remove if same as default
		if (change)
			this.storePanelVarsAsync();
	}

	storePanelVarsAsync() {
		if (this.panelVarsUpdateTimer !== null) {
			clearTimeout(this.panelVarsUpdateTimer);
			this.panelVarsUpdateTimer = null;
		}
		this.panelVarsUpdateTimer = setTimeout(this.storePanelVars(), 1);
	}

	storePanelVars() {
		this.panelVarsUpdateTimer = null;
		this.ui.updateUrlHash();
	}

	/**
	 * Return all defined panel vars for this panel
	 * @returns {object}
	 */
	getPanelVars() {
		return this.panel_vars;
	}

	/**
	 * Toggles the panel's paused state
	 */
	pauseToggle() {
		this.paused = !this.paused;
		console.log("Panel updates paused " + this.paused);
		if (this.paused) {
			this.pause_el.addClass("paused");
			this.pause_el.attr("title", "Unpause");
			if (this.display_widget && this.display_widget.onUnpaused)
				this.display_widget.onPaused();
		} else {
			this.pause_el.removeClass("paused");
			this.pause_el.attr("title", "Pause");
			if (this.display_widget && this.display_widget.onPaused)
				this.display_widget.onUnpaused();
		}
	}

	/**
	 * Call this to manually update FPS count of the panel; used by :js:doc:`CompositePanelWidgetBase`
	 * @param {boolean} count_frame = true
	 */
	updateFps(count_frame = true) {
		if (this.paused) return;

		if (count_frame) this.fps_frame_count++;

		let that = this;

        if (!this.last_fps_updated || Date.now() - this.last_fps_updated > 1000) {
			let fps_string = this.display_widget && this.display_widget.getFpsString ? this.display_widget.getFpsString() : null;
            if (fps_string) {
                this.fps_string = fps_string; // widget sets string
            } else {
                let dt = this.last_fps_updated ? Date.now() - this.last_fps_updated : 0;
                let r = dt ? 1000 / dt : 0;
                this.fps = this.fps_frame_count * r;
                this.fps_string = ((this.fps > 0.01 && this.fps < 1.0) ? this.fps.toFixed(1) : this.fps.toFixed(0)) + ' Hz';
            }
            this.last_fps_updated = Date.now();
            this.fps_frame_count = 0;
        }
    
        if (this.fps_clear_timeout) {
            clearTimeout(this.fps_clear_timeout);
            this.fps_clear_timeout = null;
        }
            
        if (this.fps_visible) {
            this.fps_el.html(this.fps_string);
            if (this.fps < this.low_fps && this.display_widget && this.display_widget.video_width) {
                this.fps_el.addClass('error');
            } else {
                this.fps_el.removeClass('error');
            }

			// clear 2s after updates stop
            this.fps_clear_timeout = setTimeout(() => {
                that.updateFps(false);
                this.fps_el.removeClass('error');
            }, 2000);
        }
    }

	onDataContextWrapper = (msg, ev) => {
		if (!this.initiated) {
			this.init_data = [msg, ev]; //store for after init
			return;
		}

		let that = this;
		setTimeout(() => {
			if ([ "video", "sensor_msgs/msg/Image", "sensor_msgs/msg/CompressedImage", "ffmpeg_image_transport_msgs/msg/FFMPEGPacket" ].indexOf(that.msg_type) > -1) {
				that.onStream(stream);
			} else {
				that.onData(msg, ev);
			}
		}, 0);
	};

	/**
	 * Call this to explicitly rebuild the panel's menu
	 */
	updateMenu() {
		console.log("Setting up panel menu of " + this.id_source + "; msg_type=" + this.msg_type);

		let els = [];
		let that = this;

		if (this.msg_type != null && this.msg_type != "video") {
			// message type info dialog
			this.msg_types_el = $('<div class="menu_line panel_msg_types_line"><a href="#" id="panel_msg_types_' + this.n + '" class="msg_types" title="View message type definition">' + this.msg_type + "</a></div>");
			this.msg_types_el.click(function (ev) {
				that.ui.messageTypeDialog(that.msg_type);
				ev.cancelBubble = true;
				ev.preventDefault();
			});
			els.push(this.msg_types_el);

			// display source for widgets
			if (this.display_widget && !isVideoTopicStream(this.msg_type)) {
				let show_source_el = $('<div class="menu_line" id="display_panel_source_link_' + this.n +'"><label for="display_panel_source_' + this.n + '" class="display_panel_source_label" id="display_panel_source_label_' + this.n + '"><input type="checkbox" id="display_panel_source_' + this.n + '" class="panel_display_source"' + (this.src_visible ? " checked" : "") + ' title="Display source data"> Show source data</label></div>');
				let show_source_cb = show_source_el.find(".panel_display_source");
				show_source_cb.change(function (ev) {
					that.src_visible = $(this).prop("checked");
					that.storePanelVarAsBool('src', that.src_visible);

					if (that.src_visible) {
						that.source_el.addClass(["enabled", "widget_visible"]);
						that.widget_el.addClass("source_visible");
						let w = parseInt($(that.grid_widget).attr("gs-w"));
						that.panel_w_src_hidden = w;
						if (w < 5) {
							w *= 2;
							that.ui.grid.update(that.grid_widget, { w: w }); // updates url hash, triggers onResize
						} else {
							that.onResize();
							that.ui.updateUrlHash();
						}
					} else {
						that.source_el.removeClass(["enabled", "widget_visible"]);
						that.widget_el.removeClass("source_visible");
						let curr_w = parseInt($(that.grid_widget).attr("gs-w"));
						let w = that.panel_w_src_hidden
							? that.panel_w_src_hidden
							: Math.floor(curr_w / 2);
						that.ui.grid.update(that.grid_widget, { w: w }); //updates url hash, triggers onResize
						if (curr_w == w) that.onResize();
					}
				});
				els.push(show_source_el);

				// text filter of source data lines
				let src_filter_el = $('<div class="menu_line filter_line"><input type="text" class="panel_source_filter" placeholder="Filter source data..." title="Show only source data lines containing this text" spellcheck="false" autocomplete="off"></div>');
				src_filter_el.find("INPUT")
					.val(that.src_filter || "")
					.on("input", function () {
						that.src_filter = $(this).val();
						that.renderSource();
					})
					.on("keydown keyup", (ev) => ev.stopPropagation()); // don't trigger UI hotkeys while typing
				els.push(src_filter_el);
			}
		} else if (this.msg_type == "video") {
			// message type info dialog
			this.msg_types_el = $('<div class="menu_line panel_msg_types_line"><span class="msg_types">Video/H.264</span></div>');
			els.push(this.msg_types_el);
		}

		// fps toggle button
		let fps_visible_cb_el = $('<div class="menu_line"></div>');
		let fps_visible_label_el = $('<label for="show_fps_cb_' + this.n + '" id="show_fps_cb_label_' + this.n + '">' + this.show_fps_menu_label + "</>");
		let fps_visible_cb = $('<input type="checkbox" id="show_fps_cb_' + this.n + '"' + (this.fps_visible ? " checked" : "") + ' title="' + this.show_fps_menu_label + '"/>');
		fps_visible_label_el.append(fps_visible_cb);
		fps_visible_cb_el.append(fps_visible_label_el);
		fps_visible_cb.change(function (ev) {
			that.fps_visible = $(this).prop("checked");
			that.storePanelVarAsBool('fps', that.fps_visible);
			that.updateFps();
			if (that.fps_visible) {
				that.fps_el.addClass("enabled");
			} else {
				that.fps_el.removeClass("enabled");
			}
			that.ui.updateUrlHash();
		});
		els.push(fps_visible_cb_el);

		// custom widget buttons are added to els
		if (this.display_widget && this.display_widget.setupMenu != null) {
			this.display_widget.setupMenu(els);
		}

		// close panel button
		this.close_el = $('<div class="menu_line close_panel" id="close_panel_menu_' + this.n + '"><a href="#" id="close_panel_link_' + this.n + '">Remove panel<span class="icon"></span></a></div>');
		this.close_el.click(function (ev) {
			if (!isTouchDevice() || that.close_el.hasClass("warn")) {
				that.close();
				if (that.ui.widgets[that.id_source]) that.ui.updateWidgetsMenu();
			} else {
				that.close_el.addClass("warn");
			}
			ev.cancelBubble = true;
			ev.preventDefault();
		});
		els.push(this.close_el);

		$("#monitor_menu_content_" + this.n).empty();
		$("#monitor_menu_content_" + this.n).html('<div class="hover_keeper"></div>');
		this.menu_content_underlay = $('<div class="menu_content_underlay"></div>');
		$("#monitor_menu_content_" + this.n).append(this.menu_content_underlay);

		if (this.menu_extra_class)
			$("#monitor_menu_content_" + this.n)
				.parent()
				.addClass(this.menu_extra_class);

		// let linesCont = $('<div class="menu_lines"></div>');
		for (let i = 0; i < els.length; i++) {
			$("#monitor_menu_content_" + this.n).append(els[i]);
		}
	}

	autoMenuPosition() {
		let menu_el = $("#monitor_menu_" + this.n);
		let content_el = $("#monitor_menu_content_" + this.n);
		if (!menu_el.length || !content_el.length) return;
		let pos = menu_el.offset();
		if (!isTouchDevice() && pos.left < 330 && !$("#grid-stack").hasClass("gs-1")) {
			//not in 1-col mode
			menu_el.addClass("right");
		} else {
			menu_el.removeClass("right");
		}
	}

	getAvailableWidgetSize() {
		let ref = this.grid_widget;

		let w = $(ref).innerWidth();
		let h = parseInt($(ref).css("height"));

		//console.warn('Panel w x h, grid_widget', w, h, ref);

		if (!this.maximized) {
			// w -= 20;
			h -= 43;
		}

		return [w, h];
	}

	onResize() {
		[this.widget_width, this.widget_height] = this.getAvailableWidgetSize();

		let widget_el = $("#panel_widget_" + this.n);

		// console.info('Resizing panel widget for '+ this.id_source+' to '+this.widget_width +' x '+this.widget_height);

		if (this.widget_width < 100) widget_el.parent().parent().addClass("narrow-panel");
		else widget_el.parent().parent().removeClass("narrow-panel");

		if (this.widget_width < 50) widget_el.parent().parent().addClass("tiny-panel");
		else widget_el.parent().parent().removeClass("tiny-panel");

		widget_el.parent().css("height", this.widget_height);
		$("#panel_source_" + this.n).css("height", this.widget_height - 24);

		this.widget_width = this.src_visible
			? this.widget_width / 2.0
			: this.widget_width;

		// auto scale canvas
		let canvas = document.getElementById("panel_canvas_" + this.n);
		if (canvas && !$(canvas).hasClass("big_canvas") && !$(canvas).hasClass("canvas_tile")) {
			canvas.width = this.widget_width;
			canvas.height = this.widget_height;
		}

		// auto scale THREE renderer & set camera aspect
		if (this.display_widget) {
			if (this.display_widget.renderer && this.display_widget.autoresize_renderer) {
				this.display_widget.camera.aspect = parseFloat(this.widget_width) / parseFloat(this.widget_height);
				this.display_widget.camera.updateProjectionMatrix();
				this.display_widget.renderer.setSize(
					this.widget_width,
					this.widget_height,
				);
			}

			if (this.display_widget.onResize) {
				this.display_widget.onResize();
			}
		}

		// if (this.resizeEventHandler != null) this.resizeEventHandler();
	}

	maximize(state = true) {
		if (state) {

			if (!this.style_before_maximizing) {
				this.style_before_maximizing = {
					'top': $(this.grid_widget).css('top'),
					'left': $(this.grid_widget).css('left'),
					'width': $(this.grid_widget).css('width'),
					'height': $(this.grid_widget).css('height'),
				}
			}

			if (isTouchDevice()) this.ui.openFullscreen();

			let h = window.innerHeight; //doesn't work on mobile safari (adddress bar is not included)
			if (isTouchDevice() && isSafari()) {
				h = "100dvh";
			}
			console.log(`Maximizing panel ${this.id_source} w.height=${h}`, this.style_before_maximizing);
			
			$("BODY").addClass("no-scroll");
			this.ui.setMaximizedPanel(this);
			$(this.grid_widget)
				.addClass("maximized")
				.css({
					top: $(window).scrollTop() - 60,
					height: h,
				});

			this.ui.grid.resizable(this.grid_widget, false);
			this.ui.grid.movable(this.grid_widget, false);
		} else {
			console.log(`Unmaximizing panel ${this.id_source}`);
			if (this.ui.maximized_panel == this) {
				this.ui.setMaximizedPanel(null);
			}
			$(this.grid_widget).removeClass("maximized").css({
				top: this.style_before_maximizing['top'],
				height: this.style_before_maximizing['height'],
			});
			delete this.style_before_maximizing;
			$("BODY").removeClass("no-scroll");

			if (!isTouchDevice()) {
				this.ui.grid.resizable(this.grid_widget, true);
				this.ui.grid.movable(this.grid_widget, true);
			}
		}
		this.maximized = state;
		this.onResize();
	}

	onData(msg, ev) {
		// console.log('Got data for '+this.id_source+': ', msg)

		if (this.paused) return;

		let raw_len = 0;
		let raw_type = "";
		if (ev.data instanceof ArrayBuffer) {
			raw_len = ev.data.byteLength;
			raw_type = "ArrayBuffer";
		} else if (ev.data instanceof Blob) {
			raw_len = ev.data.size;
			raw_type = "Blob";
		} else {
			raw_len = msg.length;
			raw_type = "String";
		}

		let datahr = "N/A";
		if (
			(this.msg_type == "std_msgs/msg/String" && msg.data) ||
			raw_type === "String"
		) {
			let str_val = null;
			if (this.msg_type == "std_msgs/msg/String") str_val = msg.data;
			else str_val = msg;

			try {
				if (str_val == null || str_val == undefined) datahr = "";
				else if (
					(typeof str_val === "string" || str_val instanceof String) &&
					str_val.indexOf("xml") !== -1
				) {
					datahr = linkifyURLs(escapeHtml(window.xmlFormatter(str_val)), true);
				} else {
					datahr = linkifyURLs(escapeHtml(str_val));
				}
			} catch (e) {
				console.error(
					"Err parsing str_val, this.msg_type=" +
						this.msg_type +
						"; raw_type=" +
						raw_type +
						"; ev.data=" +
						typeof ev.data,
					e,
					str_val,
				);
				console.error("ev.data", ev.data);
				console.error("decoded msg", msg);
			}

			//console.log(window.xmlFormatter)
		} else if (msg && this.src_visible) {
			if (raw_len < 10000) {
				try {
					datahr = JSON.stringify(msg, null, 2);
				} catch (e) {
					datahr = "Error (see console)";
					console.error("Exception while deserializing message: " + e, msg);
				}
			} else {
				datahr = "";
				let trimmed = {};
				if (msg.header) trimmed.header = msg.header;
				if (msg.format) trimmed.format = msg.format;

				datahr += JSON.stringify(trimmed, null, 2) + "\n\n";
				datahr += "-- trimmed --";
			}
		}

		// if (this.ui.topic_widgets[this.id_source] && this.ui.topic_widgets[this.id_source].widget)
		//     this.ui.topic_widgets[this.id_source].widget(this, msg);
		// else if (this.ui.type_widgets[this.msg_type] && this.ui.type_widgets[this.msg_type].widget)
		//     this.ui.type_widgets[this.msg_type].widget(this, msg);

		if (this.display_widget) {
			this.display_widget.onData(msg);
		}

		this.updateFps();

		if (this.src_visible) {
			let ts = ev.timeStamp; // showing local stamp
			this.last_source_header = "Received: " + ts + "<br>" +
					"&lt;" + raw_type + "&gt; " + raw_len + " " + (raw_type != "String" ? "B" : "chars") + "<br><br>";
			this.last_source_data = datahr;
			this.renderSource();

			let newh = $("#panel_source_" + this.n).height();
			//console.log('max_height='+this.max_height+' newh='+newh);

			if (newh > this.max_height) {
				this.max_height = newh;
			}
		}
	}

	/**
	 * Renders the last received message into the source data view,
	 * keeping only data lines matching the source filter (if any).
	 */
	renderSource() {
		if (this.last_source_header === undefined) return;

		let data = this.last_source_data;
		const terms = (this.src_filter || "").toLowerCase().split(/\s+/).filter((t) => t.length);
		if (terms.length) {
			const lines = String(data).split("\n").filter((line) => {
				const l = line.toLowerCase();
				return terms.every((t) => l.indexOf(t) > -1);
			});
			data = lines.length ? lines.join("\n") : "-- no lines match filter --";
		}
		this.source_el.html(this.last_source_header + data);
	}

	onStream(stream) {
		console.log("Got stream for " + this.id_source + ": ", stream);
	}

	close() {
		// remove panel

		if (this.maximized) {
			this.maximize(false);
		}

		if (this.ui.panel_menu_on === this) this.ui.panelMenuTouchToggle(); //remove open menu

		// uncheck in topic menu if topic
		if (this.ui.graph_menu.topics[this.id_source]) {
			this.ui.graph_menu.uncheckTopic(this.id_source);
		}

		if (this.fps_clear_timeout) {
			clearTimeout(this.fps_clear_timeout);
			this.fps_clear_timeout = null;
		}

		// uncheck in cam menu if cam
		if ($('.camera[data-src="' + this.id_source + '"] INPUT:checkbox').length > 0) {
			$('.camera[data-src="' + this.id_source + '"] INPUT:checkbox').removeClass(
				"enabled",
			); //prevent eventhandler
			$('.camera[data-src="' + this.id_source + '"] INPUT:checkbox').prop(
				"checked",
				false,
			);
			$('.camera[data-src="' + this.id_source + '"] INPUT:checkbox').addClass(
				"enabled",
			);
		}

		this.ui.client.offTopicData(this.id_source, this.onDataContextWrapper);

		if (this.display_widget && this.display_widget.onClose) {
			this.display_widget.onClose();
		}

		this.ui.grid.removeWidget(this.grid_widget);

		console.warn("Removing panel " + this.id_source, this.ui.panels[this.id_source]);
		delete this.ui.panels[this.id_source];

		$('.grid_panel[data-source="' + this.id_source + '"]').remove(); //updates url hash
		console.log("Panel closed for " + this.id_source);

		this.ui.updateUrlHash();
	}
}
