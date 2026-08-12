//#region node_modules/canvas-confetti/dist/confetti.module.mjs
var module = {};
(function main(global, module, isWorker, workerSize) {
	var canUseWorker = !!(global.Worker && global.Blob && global.Promise && global.OffscreenCanvas && global.OffscreenCanvasRenderingContext2D && global.HTMLCanvasElement && global.HTMLCanvasElement.prototype.transferControlToOffscreen && global.URL && global.URL.createObjectURL);
	var canUsePaths = typeof Path2D === "function" && typeof DOMMatrix === "function";
	var canDrawBitmap = (function() {
		if (!global.OffscreenCanvas) return false;
		try {
			var canvas = new OffscreenCanvas(1, 1);
			var ctx = canvas.getContext("2d");
			ctx.fillRect(0, 0, 1, 1);
			var bitmap = canvas.transferToImageBitmap();
			ctx.createPattern(bitmap, "no-repeat");
		} catch (e) {
			return false;
		}
		return true;
	})();
	function noop() {}
	function promise(func) {
		var ModulePromise = module.exports.Promise;
		var Prom = ModulePromise !== void 0 ? ModulePromise : global.Promise;
		if (typeof Prom === "function") return new Prom(func);
		func(noop, noop);
		return null;
	}
	var bitmapMapper = (function(skipTransform, map) {
		return {
			transform: function(bitmap) {
				if (skipTransform) return bitmap;
				if (map.has(bitmap)) return map.get(bitmap);
				var canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
				canvas.getContext("2d").drawImage(bitmap, 0, 0);
				map.set(bitmap, canvas);
				return canvas;
			},
			clear: function() {
				map.clear();
			}
		};
	})(canDrawBitmap, /* @__PURE__ */ new Map());
	var raf = function() {
		var TIME = Math.floor(1e3 / 60);
		var frame, cancel;
		var frames = {};
		var lastFrameTime = 0;
		if (typeof requestAnimationFrame === "function" && typeof cancelAnimationFrame === "function") {
			frame = function(cb) {
				var id = Math.random();
				frames[id] = requestAnimationFrame(function onFrame(time) {
					if (lastFrameTime === time || lastFrameTime + TIME - 1 < time) {
						lastFrameTime = time;
						delete frames[id];
						cb();
					} else frames[id] = requestAnimationFrame(onFrame);
				});
				return id;
			};
			cancel = function(id) {
				if (frames[id]) cancelAnimationFrame(frames[id]);
			};
		} else {
			frame = function(cb) {
				return setTimeout(cb, TIME);
			};
			cancel = function(timer) {
				return clearTimeout(timer);
			};
		}
		return {
			frame,
			cancel
		};
	}();
	var getWorker = (function() {
		var worker;
		var prom;
		var resolves = {};
		function decorate(worker) {
			function execute(options, callback) {
				worker.postMessage({
					options: options || {},
					callback
				});
			}
			worker.init = function initWorker(canvas) {
				var offscreen = canvas.transferControlToOffscreen();
				worker.postMessage({ canvas: offscreen }, [offscreen]);
			};
			worker.fire = function fireWorker(options, size, done) {
				if (prom) {
					execute(options, null);
					return prom;
				}
				var id = Math.random().toString(36).slice(2);
				prom = promise(function(resolve) {
					function workerDone(msg) {
						if (msg.data.callback !== id) return;
						delete resolves[id];
						worker.removeEventListener("message", workerDone);
						prom = null;
						bitmapMapper.clear();
						done();
						resolve();
					}
					worker.addEventListener("message", workerDone);
					execute(options, id);
					resolves[id] = workerDone.bind(null, { data: { callback: id } });
				});
				return prom;
			};
			worker.reset = function resetWorker() {
				worker.postMessage({ reset: true });
				for (var id in resolves) {
					resolves[id]();
					delete resolves[id];
				}
			};
		}
		return function() {
			if (worker) return worker;
			if (!isWorker && canUseWorker) {
				var code = [
					"var CONFETTI, SIZE = {}, module = {};",
					"(" + main.toString() + ")(this, module, true, SIZE);",
					"onmessage = function(msg) {",
					"  if (msg.data.options) {",
					"    CONFETTI(msg.data.options).then(function () {",
					"      if (msg.data.callback) {",
					"        postMessage({ callback: msg.data.callback });",
					"      }",
					"    });",
					"  } else if (msg.data.reset) {",
					"    CONFETTI && CONFETTI.reset();",
					"  } else if (msg.data.resize) {",
					"    SIZE.width = msg.data.resize.width;",
					"    SIZE.height = msg.data.resize.height;",
					"  } else if (msg.data.canvas) {",
					"    SIZE.width = msg.data.canvas.width;",
					"    SIZE.height = msg.data.canvas.height;",
					"    CONFETTI = module.exports.create(msg.data.canvas);",
					"  }",
					"}"
				].join("\n");
				try {
					worker = new Worker(URL.createObjectURL(new Blob([code])));
				} catch (e) {
					typeof console !== "undefined" && typeof console.warn === "function" && console.warn("🎊 Could not load worker", e);
					return null;
				}
				decorate(worker);
			}
			return worker;
		};
	})();
	var defaults = {
		particleCount: 50,
		angle: 90,
		spread: 45,
		startVelocity: 45,
		decay: .9,
		gravity: 1,
		drift: 0,
		ticks: 200,
		x: .5,
		y: .5,
		shapes: ["square", "circle"],
		zIndex: 100,
		colors: [
			"#26ccff",
			"#a25afd",
			"#ff5e7e",
			"#88ff5a",
			"#fcff42",
			"#ffa62d",
			"#ff36ff"
		],
		disableForReducedMotion: false,
		scalar: 1
	};
	function convert(val, transform) {
		return transform ? transform(val) : val;
	}
	function isOk(val) {
		return !(val === null || val === void 0);
	}
	function prop(options, name, transform) {
		return convert(options && isOk(options[name]) ? options[name] : defaults[name], transform);
	}
	function onlyPositiveInt(number) {
		return number < 0 ? 0 : Math.floor(number);
	}
	function randomInt(min, max) {
		return Math.floor(Math.random() * (max - min)) + min;
	}
	function toDecimal(str) {
		return parseInt(str, 16);
	}
	function colorsToRgb(colors) {
		return colors.map(hexToRgb);
	}
	function hexToRgb(str) {
		var val = String(str).replace(/[^0-9a-f]/gi, "");
		if (val.length < 6) val = val[0] + val[0] + val[1] + val[1] + val[2] + val[2];
		return {
			r: toDecimal(val.substring(0, 2)),
			g: toDecimal(val.substring(2, 4)),
			b: toDecimal(val.substring(4, 6))
		};
	}
	function getOrigin(options) {
		var origin = prop(options, "origin", Object);
		origin.x = prop(origin, "x", Number);
		origin.y = prop(origin, "y", Number);
		return origin;
	}
	function setCanvasWindowSize(canvas) {
		canvas.width = document.documentElement.clientWidth;
		canvas.height = document.documentElement.clientHeight;
	}
	function setCanvasRectSize(canvas) {
		var rect = canvas.getBoundingClientRect();
		canvas.width = rect.width;
		canvas.height = rect.height;
	}
	function getCanvas(zIndex) {
		var canvas = document.createElement("canvas");
		canvas.style.position = "fixed";
		canvas.style.top = "0px";
		canvas.style.left = "0px";
		canvas.style.pointerEvents = "none";
		canvas.style.zIndex = zIndex;
		return canvas;
	}
	function ellipse(context, x, y, radiusX, radiusY, rotation, startAngle, endAngle, antiClockwise) {
		context.save();
		context.translate(x, y);
		context.rotate(rotation);
		context.scale(radiusX, radiusY);
		context.arc(0, 0, 1, startAngle, endAngle, antiClockwise);
		context.restore();
	}
	function randomPhysics(opts) {
		var radAngle = opts.angle * (Math.PI / 180);
		var radSpread = opts.spread * (Math.PI / 180);
		return {
			x: opts.x,
			y: opts.y,
			wobble: Math.random() * 10,
			wobbleSpeed: Math.min(.11, Math.random() * .1 + .05),
			velocity: opts.startVelocity * .5 + Math.random() * opts.startVelocity,
			angle2D: -radAngle + (.5 * radSpread - Math.random() * radSpread),
			tiltAngle: (Math.random() * .5 + .25) * Math.PI,
			color: opts.color,
			shape: opts.shape,
			tick: 0,
			totalTicks: opts.ticks,
			decay: opts.decay,
			drift: opts.drift,
			random: Math.random() + 2,
			tiltSin: 0,
			tiltCos: 0,
			wobbleX: 0,
			wobbleY: 0,
			gravity: opts.gravity * 3,
			ovalScalar: .6,
			scalar: opts.scalar,
			flat: opts.flat
		};
	}
	function updateFetti(context, fetti) {
		fetti.x += Math.cos(fetti.angle2D) * fetti.velocity + fetti.drift;
		fetti.y += Math.sin(fetti.angle2D) * fetti.velocity + fetti.gravity;
		fetti.velocity *= fetti.decay;
		if (fetti.flat) {
			fetti.wobble = 0;
			fetti.wobbleX = fetti.x + 10 * fetti.scalar;
			fetti.wobbleY = fetti.y + 10 * fetti.scalar;
			fetti.tiltSin = 0;
			fetti.tiltCos = 0;
			fetti.random = 1;
		} else {
			fetti.wobble += fetti.wobbleSpeed;
			fetti.wobbleX = fetti.x + 10 * fetti.scalar * Math.cos(fetti.wobble);
			fetti.wobbleY = fetti.y + 10 * fetti.scalar * Math.sin(fetti.wobble);
			fetti.tiltAngle += .1;
			fetti.tiltSin = Math.sin(fetti.tiltAngle);
			fetti.tiltCos = Math.cos(fetti.tiltAngle);
			fetti.random = Math.random() + 2;
		}
		var progress = fetti.tick++ / fetti.totalTicks;
		var x1 = fetti.x + fetti.random * fetti.tiltCos;
		var y1 = fetti.y + fetti.random * fetti.tiltSin;
		var x2 = fetti.wobbleX + fetti.random * fetti.tiltCos;
		var y2 = fetti.wobbleY + fetti.random * fetti.tiltSin;
		context.fillStyle = "rgba(" + fetti.color.r + ", " + fetti.color.g + ", " + fetti.color.b + ", " + (1 - progress) + ")";
		context.beginPath();
		if (canUsePaths && fetti.shape.type === "path" && typeof fetti.shape.path === "string" && Array.isArray(fetti.shape.matrix)) context.fill(transformPath2D(fetti.shape.path, fetti.shape.matrix, fetti.x, fetti.y, Math.abs(x2 - x1) * .1, Math.abs(y2 - y1) * .1, Math.PI / 10 * fetti.wobble));
		else if (fetti.shape.type === "bitmap") {
			var rotation = Math.PI / 10 * fetti.wobble;
			var scaleX = Math.abs(x2 - x1) * .1;
			var scaleY = Math.abs(y2 - y1) * .1;
			var width = fetti.shape.bitmap.width * fetti.scalar;
			var height = fetti.shape.bitmap.height * fetti.scalar;
			var matrix = new DOMMatrix([
				Math.cos(rotation) * scaleX,
				Math.sin(rotation) * scaleX,
				-Math.sin(rotation) * scaleY,
				Math.cos(rotation) * scaleY,
				fetti.x,
				fetti.y
			]);
			matrix.multiplySelf(new DOMMatrix(fetti.shape.matrix));
			var pattern = context.createPattern(bitmapMapper.transform(fetti.shape.bitmap), "no-repeat");
			pattern.setTransform(matrix);
			context.globalAlpha = 1 - progress;
			context.fillStyle = pattern;
			context.fillRect(fetti.x - width / 2, fetti.y - height / 2, width, height);
			context.globalAlpha = 1;
		} else if (fetti.shape === "circle") context.ellipse ? context.ellipse(fetti.x, fetti.y, Math.abs(x2 - x1) * fetti.ovalScalar, Math.abs(y2 - y1) * fetti.ovalScalar, Math.PI / 10 * fetti.wobble, 0, 2 * Math.PI) : ellipse(context, fetti.x, fetti.y, Math.abs(x2 - x1) * fetti.ovalScalar, Math.abs(y2 - y1) * fetti.ovalScalar, Math.PI / 10 * fetti.wobble, 0, 2 * Math.PI);
		else if (fetti.shape === "star") {
			var rot = Math.PI / 2 * 3;
			var innerRadius = 4 * fetti.scalar;
			var outerRadius = 8 * fetti.scalar;
			var x = fetti.x;
			var y = fetti.y;
			var spikes = 5;
			var step = Math.PI / spikes;
			while (spikes--) {
				x = fetti.x + Math.cos(rot) * outerRadius;
				y = fetti.y + Math.sin(rot) * outerRadius;
				context.lineTo(x, y);
				rot += step;
				x = fetti.x + Math.cos(rot) * innerRadius;
				y = fetti.y + Math.sin(rot) * innerRadius;
				context.lineTo(x, y);
				rot += step;
			}
		} else {
			context.moveTo(Math.floor(fetti.x), Math.floor(fetti.y));
			context.lineTo(Math.floor(fetti.wobbleX), Math.floor(y1));
			context.lineTo(Math.floor(x2), Math.floor(y2));
			context.lineTo(Math.floor(x1), Math.floor(fetti.wobbleY));
		}
		context.closePath();
		context.fill();
		return fetti.tick < fetti.totalTicks;
	}
	function animate(canvas, fettis, resizer, size, done) {
		var animatingFettis = fettis.slice();
		var context = canvas.getContext("2d");
		var animationFrame;
		var destroy;
		var prom = promise(function(resolve) {
			function onDone() {
				animationFrame = destroy = null;
				context.clearRect(0, 0, size.width, size.height);
				bitmapMapper.clear();
				done();
				resolve();
			}
			function update() {
				if (isWorker && !(size.width === workerSize.width && size.height === workerSize.height)) {
					size.width = canvas.width = workerSize.width;
					size.height = canvas.height = workerSize.height;
				}
				if (!size.width && !size.height) {
					resizer(canvas);
					size.width = canvas.width;
					size.height = canvas.height;
				}
				context.clearRect(0, 0, size.width, size.height);
				animatingFettis = animatingFettis.filter(function(fetti) {
					return updateFetti(context, fetti);
				});
				if (animatingFettis.length) animationFrame = raf.frame(update);
				else onDone();
			}
			animationFrame = raf.frame(update);
			destroy = onDone;
		});
		return {
			addFettis: function(fettis) {
				animatingFettis = animatingFettis.concat(fettis);
				return prom;
			},
			canvas,
			promise: prom,
			reset: function() {
				if (animationFrame) raf.cancel(animationFrame);
				if (destroy) destroy();
			}
		};
	}
	function confettiCannon(canvas, globalOpts) {
		var isLibCanvas = !canvas;
		var allowResize = !!prop(globalOpts || {}, "resize");
		var hasResizeEventRegistered = false;
		var globalDisableForReducedMotion = prop(globalOpts, "disableForReducedMotion", Boolean);
		var worker = canUseWorker && !!prop(globalOpts || {}, "useWorker") ? getWorker() : null;
		var resizer = isLibCanvas ? setCanvasWindowSize : setCanvasRectSize;
		var initialized = canvas && worker ? !!canvas.__confetti_initialized : false;
		var preferLessMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion)").matches;
		var animationObj;
		function fireLocal(options, size, done) {
			var particleCount = prop(options, "particleCount", onlyPositiveInt);
			var angle = prop(options, "angle", Number);
			var spread = prop(options, "spread", Number);
			var startVelocity = prop(options, "startVelocity", Number);
			var decay = prop(options, "decay", Number);
			var gravity = prop(options, "gravity", Number);
			var drift = prop(options, "drift", Number);
			var colors = prop(options, "colors", colorsToRgb);
			var ticks = prop(options, "ticks", Number);
			var shapes = prop(options, "shapes");
			var scalar = prop(options, "scalar");
			var flat = !!prop(options, "flat");
			var origin = getOrigin(options);
			var temp = particleCount;
			var fettis = [];
			var startX = canvas.width * origin.x;
			var startY = canvas.height * origin.y;
			while (temp--) fettis.push(randomPhysics({
				x: startX,
				y: startY,
				angle,
				spread,
				startVelocity,
				color: colors[temp % colors.length],
				shape: shapes[randomInt(0, shapes.length)],
				ticks,
				decay,
				gravity,
				drift,
				scalar,
				flat
			}));
			if (animationObj) return animationObj.addFettis(fettis);
			animationObj = animate(canvas, fettis, resizer, size, done);
			return animationObj.promise;
		}
		function fire(options) {
			var disableForReducedMotion = globalDisableForReducedMotion || prop(options, "disableForReducedMotion", Boolean);
			var zIndex = prop(options, "zIndex", Number);
			if (disableForReducedMotion && preferLessMotion) return promise(function(resolve) {
				resolve();
			});
			if (isLibCanvas && animationObj) canvas = animationObj.canvas;
			else if (isLibCanvas && !canvas) {
				canvas = getCanvas(zIndex);
				document.body.appendChild(canvas);
			}
			if (allowResize && !initialized) resizer(canvas);
			var size = {
				width: canvas.width,
				height: canvas.height
			};
			if (worker && !initialized) worker.init(canvas);
			initialized = true;
			if (worker) canvas.__confetti_initialized = true;
			function onResize() {
				if (worker) {
					var obj = { getBoundingClientRect: function() {
						if (!isLibCanvas) return canvas.getBoundingClientRect();
					} };
					resizer(obj);
					worker.postMessage({ resize: {
						width: obj.width,
						height: obj.height
					} });
					return;
				}
				size.width = size.height = null;
			}
			function done() {
				animationObj = null;
				if (allowResize) {
					hasResizeEventRegistered = false;
					global.removeEventListener("resize", onResize);
				}
				if (isLibCanvas && canvas) {
					if (document.body.contains(canvas)) document.body.removeChild(canvas);
					canvas = null;
					initialized = false;
				}
			}
			if (allowResize && !hasResizeEventRegistered) {
				hasResizeEventRegistered = true;
				global.addEventListener("resize", onResize, false);
			}
			if (worker) return worker.fire(options, size, done);
			return fireLocal(options, size, done);
		}
		fire.reset = function() {
			if (worker) worker.reset();
			if (animationObj) animationObj.reset();
		};
		return fire;
	}
	var defaultFire;
	function getDefaultFire() {
		if (!defaultFire) defaultFire = confettiCannon(null, {
			useWorker: true,
			resize: true
		});
		return defaultFire;
	}
	function transformPath2D(pathString, pathMatrix, x, y, scaleX, scaleY, rotation) {
		var path2d = new Path2D(pathString);
		var t1 = new Path2D();
		t1.addPath(path2d, new DOMMatrix(pathMatrix));
		var t2 = new Path2D();
		t2.addPath(t1, new DOMMatrix([
			Math.cos(rotation) * scaleX,
			Math.sin(rotation) * scaleX,
			-Math.sin(rotation) * scaleY,
			Math.cos(rotation) * scaleY,
			x,
			y
		]));
		return t2;
	}
	function shapeFromPath(pathData) {
		if (!canUsePaths) throw new Error("path confetti are not supported in this browser");
		var path, matrix;
		if (typeof pathData === "string") path = pathData;
		else {
			path = pathData.path;
			matrix = pathData.matrix;
		}
		var path2d = new Path2D(path);
		var tempCtx = document.createElement("canvas").getContext("2d");
		if (!matrix) {
			var maxSize = 1e3;
			var minX = maxSize;
			var minY = maxSize;
			var maxX = 0;
			var maxY = 0;
			var width, height;
			for (var x = 0; x < maxSize; x += 2) for (var y = 0; y < maxSize; y += 2) if (tempCtx.isPointInPath(path2d, x, y, "nonzero")) {
				minX = Math.min(minX, x);
				minY = Math.min(minY, y);
				maxX = Math.max(maxX, x);
				maxY = Math.max(maxY, y);
			}
			width = maxX - minX;
			height = maxY - minY;
			var maxDesiredSize = 10;
			var scale = Math.min(maxDesiredSize / width, maxDesiredSize / height);
			matrix = [
				scale,
				0,
				0,
				scale,
				-Math.round(width / 2 + minX) * scale,
				-Math.round(height / 2 + minY) * scale
			];
		}
		return {
			type: "path",
			path,
			matrix
		};
	}
	function shapeFromText(textData) {
		var text, scalar = 1, color = "#000000", fontFamily = "\"Apple Color Emoji\", \"Segoe UI Emoji\", \"Segoe UI Symbol\", \"Noto Color Emoji\", \"EmojiOne Color\", \"Android Emoji\", \"Twemoji Mozilla\", \"system emoji\", sans-serif";
		if (typeof textData === "string") text = textData;
		else {
			text = textData.text;
			scalar = "scalar" in textData ? textData.scalar : scalar;
			fontFamily = "fontFamily" in textData ? textData.fontFamily : fontFamily;
			color = "color" in textData ? textData.color : color;
		}
		var fontSize = 10 * scalar;
		var font = "" + fontSize + "px " + fontFamily;
		var canvas = new OffscreenCanvas(fontSize, fontSize);
		var ctx = canvas.getContext("2d");
		ctx.font = font;
		var size = ctx.measureText(text);
		var width = Math.ceil(size.actualBoundingBoxRight + size.actualBoundingBoxLeft);
		var height = Math.ceil(size.actualBoundingBoxAscent + size.actualBoundingBoxDescent);
		var padding = 2;
		var x = size.actualBoundingBoxLeft + padding;
		var y = size.actualBoundingBoxAscent + padding;
		width += padding + padding;
		height += padding + padding;
		canvas = new OffscreenCanvas(width, height);
		ctx = canvas.getContext("2d");
		ctx.font = font;
		ctx.fillStyle = color;
		ctx.fillText(text, x, y);
		var scale = 1 / scalar;
		return {
			type: "bitmap",
			bitmap: canvas.transferToImageBitmap(),
			matrix: [
				scale,
				0,
				0,
				scale,
				-width * scale / 2,
				-height * scale / 2
			]
		};
	}
	module.exports = function() {
		return getDefaultFire().apply(this, arguments);
	};
	module.exports.reset = function() {
		getDefaultFire().reset();
	};
	module.exports.create = confettiCannon;
	module.exports.shapeFromPath = shapeFromPath;
	module.exports.shapeFromText = shapeFromText;
})((function() {
	if (typeof window !== "undefined") return window;
	if (typeof self !== "undefined") return self;
	return this || {};
})(), module, false);
var confetti_module_default = module.exports;
var create = module.exports.create;
//#endregion
export { create, confetti_module_default as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FudmFzLWNvbmZldHRpLmpzIiwibmFtZXMiOltdLCJzb3VyY2VzIjpbIi4uLy4uL2NhbnZhcy1jb25mZXR0aS9kaXN0L2NvbmZldHRpLm1vZHVsZS5tanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gY2FudmFzLWNvbmZldHRpIHYxLjkuNCBidWlsdCBvbiAyMDI1LTEwLTI1VDA1OjE0OjU2LjY0MFpcbnZhciBtb2R1bGUgPSB7fTtcblxuLy8gc291cmNlIGNvbnRlbnRcbi8qIGdsb2JhbHMgTWFwICovXG5cbihmdW5jdGlvbiBtYWluKGdsb2JhbCwgbW9kdWxlLCBpc1dvcmtlciwgd29ya2VyU2l6ZSkge1xuICB2YXIgY2FuVXNlV29ya2VyID0gISEoXG4gICAgZ2xvYmFsLldvcmtlciAmJlxuICAgIGdsb2JhbC5CbG9iICYmXG4gICAgZ2xvYmFsLlByb21pc2UgJiZcbiAgICBnbG9iYWwuT2Zmc2NyZWVuQ2FudmFzICYmXG4gICAgZ2xvYmFsLk9mZnNjcmVlbkNhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCAmJlxuICAgIGdsb2JhbC5IVE1MQ2FudmFzRWxlbWVudCAmJlxuICAgIGdsb2JhbC5IVE1MQ2FudmFzRWxlbWVudC5wcm90b3R5cGUudHJhbnNmZXJDb250cm9sVG9PZmZzY3JlZW4gJiZcbiAgICBnbG9iYWwuVVJMICYmXG4gICAgZ2xvYmFsLlVSTC5jcmVhdGVPYmplY3RVUkwpO1xuXG4gIHZhciBjYW5Vc2VQYXRocyA9IHR5cGVvZiBQYXRoMkQgPT09ICdmdW5jdGlvbicgJiYgdHlwZW9mIERPTU1hdHJpeCA9PT0gJ2Z1bmN0aW9uJztcbiAgdmFyIGNhbkRyYXdCaXRtYXAgPSAoZnVuY3Rpb24gKCkge1xuICAgIC8vIHRoaXMgbW9zdGx5IHN1cHBvcnRzIHNzclxuICAgIGlmICghZ2xvYmFsLk9mZnNjcmVlbkNhbnZhcykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICB2YXIgY2FudmFzID0gbmV3IE9mZnNjcmVlbkNhbnZhcygxLCAxKTtcbiAgICAgIHZhciBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcbiAgICAgIGN0eC5maWxsUmVjdCgwLCAwLCAxLCAxKTtcbiAgICAgIHZhciBiaXRtYXAgPSBjYW52YXMudHJhbnNmZXJUb0ltYWdlQml0bWFwKCk7XG4gICAgICBjdHguY3JlYXRlUGF0dGVybihiaXRtYXAsICduby1yZXBlYXQnKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH0pKCk7XG5cbiAgZnVuY3Rpb24gbm9vcCgpIHt9XG5cbiAgLy8gY3JlYXRlIGEgcHJvbWlzZSBpZiBpdCBleGlzdHMsIG90aGVyd2lzZSwganVzdFxuICAvLyBjYWxsIHRoZSBmdW5jdGlvbiBkaXJlY3RseVxuICBmdW5jdGlvbiBwcm9taXNlKGZ1bmMpIHtcbiAgICB2YXIgTW9kdWxlUHJvbWlzZSA9IG1vZHVsZS5leHBvcnRzLlByb21pc2U7XG4gICAgdmFyIFByb20gPSBNb2R1bGVQcm9taXNlICE9PSB2b2lkIDAgPyBNb2R1bGVQcm9taXNlIDogZ2xvYmFsLlByb21pc2U7XG5cbiAgICBpZiAodHlwZW9mIFByb20gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHJldHVybiBuZXcgUHJvbShmdW5jKTtcbiAgICB9XG5cbiAgICBmdW5jKG5vb3AsIG5vb3ApO1xuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICB2YXIgYml0bWFwTWFwcGVyID0gKGZ1bmN0aW9uIChza2lwVHJhbnNmb3JtLCBtYXApIHtcbiAgICAvLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2NhdGRhZC9jYW52YXMtY29uZmV0dGkvaXNzdWVzLzIwOVxuICAgIC8vIGNyZWF0aW5nIGNhbnZhc2VzIGlzIGFjdHVhbGx5IHByZXR0eSBleHBlbnNpdmUsIHNvIHdlIHNob3VsZCBjcmVhdGUgYVxuICAgIC8vIDE6MSBtYXAgZm9yIGJpdG1hcDpjYW52YXMsIHNvIHRoYXQgd2UgY2FuIGFuaW1hdGUgdGhlIGNvbmZldHRpIGluXG4gICAgLy8gYSBwZXJmb3JtYW50IG1hbm5lciwgYnV0IGFsc28gbm90IHN0b3JlIHRoZW0gZm9yZXZlciBzbyB0aGF0IHdlIGRvbid0XG4gICAgLy8gaGF2ZSBhIG1lbW9yeSBsZWFrXG4gICAgcmV0dXJuIHtcbiAgICAgIHRyYW5zZm9ybTogZnVuY3Rpb24oYml0bWFwKSB7XG4gICAgICAgIGlmIChza2lwVHJhbnNmb3JtKSB7XG4gICAgICAgICAgcmV0dXJuIGJpdG1hcDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChtYXAuaGFzKGJpdG1hcCkpIHtcbiAgICAgICAgICByZXR1cm4gbWFwLmdldChiaXRtYXApO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGNhbnZhcyA9IG5ldyBPZmZzY3JlZW5DYW52YXMoYml0bWFwLndpZHRoLCBiaXRtYXAuaGVpZ2h0KTtcbiAgICAgICAgdmFyIGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuICAgICAgICBjdHguZHJhd0ltYWdlKGJpdG1hcCwgMCwgMCk7XG5cbiAgICAgICAgbWFwLnNldChiaXRtYXAsIGNhbnZhcyk7XG5cbiAgICAgICAgcmV0dXJuIGNhbnZhcztcbiAgICAgIH0sXG4gICAgICBjbGVhcjogZnVuY3Rpb24gKCkge1xuICAgICAgICBtYXAuY2xlYXIoKTtcbiAgICAgIH1cbiAgICB9O1xuICB9KShjYW5EcmF3Qml0bWFwLCBuZXcgTWFwKCkpO1xuXG4gIHZhciByYWYgPSAoZnVuY3Rpb24gKCkge1xuICAgIHZhciBUSU1FID0gTWF0aC5mbG9vcigxMDAwIC8gNjApO1xuICAgIHZhciBmcmFtZSwgY2FuY2VsO1xuICAgIHZhciBmcmFtZXMgPSB7fTtcbiAgICB2YXIgbGFzdEZyYW1lVGltZSA9IDA7XG5cbiAgICBpZiAodHlwZW9mIHJlcXVlc3RBbmltYXRpb25GcmFtZSA9PT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgY2FuY2VsQW5pbWF0aW9uRnJhbWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGZyYW1lID0gZnVuY3Rpb24gKGNiKSB7XG4gICAgICAgIHZhciBpZCA9IE1hdGgucmFuZG9tKCk7XG5cbiAgICAgICAgZnJhbWVzW2lkXSA9IHJlcXVlc3RBbmltYXRpb25GcmFtZShmdW5jdGlvbiBvbkZyYW1lKHRpbWUpIHtcbiAgICAgICAgICBpZiAobGFzdEZyYW1lVGltZSA9PT0gdGltZSB8fCBsYXN0RnJhbWVUaW1lICsgVElNRSAtIDEgPCB0aW1lKSB7XG4gICAgICAgICAgICBsYXN0RnJhbWVUaW1lID0gdGltZTtcbiAgICAgICAgICAgIGRlbGV0ZSBmcmFtZXNbaWRdO1xuXG4gICAgICAgICAgICBjYigpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmcmFtZXNbaWRdID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKG9uRnJhbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGlkO1xuICAgICAgfTtcbiAgICAgIGNhbmNlbCA9IGZ1bmN0aW9uIChpZCkge1xuICAgICAgICBpZiAoZnJhbWVzW2lkXSkge1xuICAgICAgICAgIGNhbmNlbEFuaW1hdGlvbkZyYW1lKGZyYW1lc1tpZF0pO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBmcmFtZSA9IGZ1bmN0aW9uIChjYikge1xuICAgICAgICByZXR1cm4gc2V0VGltZW91dChjYiwgVElNRSk7XG4gICAgICB9O1xuICAgICAgY2FuY2VsID0gZnVuY3Rpb24gKHRpbWVyKSB7XG4gICAgICAgIHJldHVybiBjbGVhclRpbWVvdXQodGltZXIpO1xuICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBmcmFtZTogZnJhbWUsIGNhbmNlbDogY2FuY2VsIH07XG4gIH0oKSk7XG5cbiAgdmFyIGdldFdvcmtlciA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHdvcmtlcjtcbiAgICB2YXIgcHJvbTtcbiAgICB2YXIgcmVzb2x2ZXMgPSB7fTtcblxuICAgIGZ1bmN0aW9uIGRlY29yYXRlKHdvcmtlcikge1xuICAgICAgZnVuY3Rpb24gZXhlY3V0ZShvcHRpb25zLCBjYWxsYmFjaykge1xuICAgICAgICB3b3JrZXIucG9zdE1lc3NhZ2UoeyBvcHRpb25zOiBvcHRpb25zIHx8IHt9LCBjYWxsYmFjazogY2FsbGJhY2sgfSk7XG4gICAgICB9XG4gICAgICB3b3JrZXIuaW5pdCA9IGZ1bmN0aW9uIGluaXRXb3JrZXIoY2FudmFzKSB7XG4gICAgICAgIHZhciBvZmZzY3JlZW4gPSBjYW52YXMudHJhbnNmZXJDb250cm9sVG9PZmZzY3JlZW4oKTtcbiAgICAgICAgd29ya2VyLnBvc3RNZXNzYWdlKHsgY2FudmFzOiBvZmZzY3JlZW4gfSwgW29mZnNjcmVlbl0pO1xuICAgICAgfTtcblxuICAgICAgd29ya2VyLmZpcmUgPSBmdW5jdGlvbiBmaXJlV29ya2VyKG9wdGlvbnMsIHNpemUsIGRvbmUpIHtcbiAgICAgICAgaWYgKHByb20pIHtcbiAgICAgICAgICBleGVjdXRlKG9wdGlvbnMsIG51bGwpO1xuICAgICAgICAgIHJldHVybiBwcm9tO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGlkID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMik7XG5cbiAgICAgICAgcHJvbSA9IHByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUpIHtcbiAgICAgICAgICBmdW5jdGlvbiB3b3JrZXJEb25lKG1zZykge1xuICAgICAgICAgICAgaWYgKG1zZy5kYXRhLmNhbGxiYWNrICE9PSBpZCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGRlbGV0ZSByZXNvbHZlc1tpZF07XG4gICAgICAgICAgICB3b3JrZXIucmVtb3ZlRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIHdvcmtlckRvbmUpO1xuXG4gICAgICAgICAgICBwcm9tID0gbnVsbDtcblxuICAgICAgICAgICAgYml0bWFwTWFwcGVyLmNsZWFyKCk7XG5cbiAgICAgICAgICAgIGRvbmUoKTtcbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB3b3JrZXIuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIHdvcmtlckRvbmUpO1xuICAgICAgICAgIGV4ZWN1dGUob3B0aW9ucywgaWQpO1xuXG4gICAgICAgICAgcmVzb2x2ZXNbaWRdID0gd29ya2VyRG9uZS5iaW5kKG51bGwsIHsgZGF0YTogeyBjYWxsYmFjazogaWQgfX0pO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcHJvbTtcbiAgICAgIH07XG5cbiAgICAgIHdvcmtlci5yZXNldCA9IGZ1bmN0aW9uIHJlc2V0V29ya2VyKCkge1xuICAgICAgICB3b3JrZXIucG9zdE1lc3NhZ2UoeyByZXNldDogdHJ1ZSB9KTtcblxuICAgICAgICBmb3IgKHZhciBpZCBpbiByZXNvbHZlcykge1xuICAgICAgICAgIHJlc29sdmVzW2lkXSgpO1xuICAgICAgICAgIGRlbGV0ZSByZXNvbHZlc1tpZF07XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmICh3b3JrZXIpIHtcbiAgICAgICAgcmV0dXJuIHdvcmtlcjtcbiAgICAgIH1cblxuICAgICAgaWYgKCFpc1dvcmtlciAmJiBjYW5Vc2VXb3JrZXIpIHtcbiAgICAgICAgdmFyIGNvZGUgPSBbXG4gICAgICAgICAgJ3ZhciBDT05GRVRUSSwgU0laRSA9IHt9LCBtb2R1bGUgPSB7fTsnLFxuICAgICAgICAgICcoJyArIG1haW4udG9TdHJpbmcoKSArICcpKHRoaXMsIG1vZHVsZSwgdHJ1ZSwgU0laRSk7JyxcbiAgICAgICAgICAnb25tZXNzYWdlID0gZnVuY3Rpb24obXNnKSB7JyxcbiAgICAgICAgICAnICBpZiAobXNnLmRhdGEub3B0aW9ucykgeycsXG4gICAgICAgICAgJyAgICBDT05GRVRUSShtc2cuZGF0YS5vcHRpb25zKS50aGVuKGZ1bmN0aW9uICgpIHsnLFxuICAgICAgICAgICcgICAgICBpZiAobXNnLmRhdGEuY2FsbGJhY2spIHsnLFxuICAgICAgICAgICcgICAgICAgIHBvc3RNZXNzYWdlKHsgY2FsbGJhY2s6IG1zZy5kYXRhLmNhbGxiYWNrIH0pOycsXG4gICAgICAgICAgJyAgICAgIH0nLFxuICAgICAgICAgICcgICAgfSk7JyxcbiAgICAgICAgICAnICB9IGVsc2UgaWYgKG1zZy5kYXRhLnJlc2V0KSB7JyxcbiAgICAgICAgICAnICAgIENPTkZFVFRJICYmIENPTkZFVFRJLnJlc2V0KCk7JyxcbiAgICAgICAgICAnICB9IGVsc2UgaWYgKG1zZy5kYXRhLnJlc2l6ZSkgeycsXG4gICAgICAgICAgJyAgICBTSVpFLndpZHRoID0gbXNnLmRhdGEucmVzaXplLndpZHRoOycsXG4gICAgICAgICAgJyAgICBTSVpFLmhlaWdodCA9IG1zZy5kYXRhLnJlc2l6ZS5oZWlnaHQ7JyxcbiAgICAgICAgICAnICB9IGVsc2UgaWYgKG1zZy5kYXRhLmNhbnZhcykgeycsXG4gICAgICAgICAgJyAgICBTSVpFLndpZHRoID0gbXNnLmRhdGEuY2FudmFzLndpZHRoOycsXG4gICAgICAgICAgJyAgICBTSVpFLmhlaWdodCA9IG1zZy5kYXRhLmNhbnZhcy5oZWlnaHQ7JyxcbiAgICAgICAgICAnICAgIENPTkZFVFRJID0gbW9kdWxlLmV4cG9ydHMuY3JlYXRlKG1zZy5kYXRhLmNhbnZhcyk7JyxcbiAgICAgICAgICAnICB9JyxcbiAgICAgICAgICAnfScsXG4gICAgICAgIF0uam9pbignXFxuJyk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgd29ya2VyID0gbmV3IFdvcmtlcihVUkwuY3JlYXRlT2JqZWN0VVJMKG5ldyBCbG9iKFtjb2RlXSkpKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgICAgICAgdHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBjb25zb2xlLndhcm4gPT09ICdmdW5jdGlvbicgPyBjb25zb2xlLndhcm4oJ/CfjoogQ291bGQgbm90IGxvYWQgd29ya2VyJywgZSkgOiBudWxsO1xuXG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBkZWNvcmF0ZSh3b3JrZXIpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gd29ya2VyO1xuICAgIH07XG4gIH0pKCk7XG5cbiAgdmFyIGRlZmF1bHRzID0ge1xuICAgIHBhcnRpY2xlQ291bnQ6IDUwLFxuICAgIGFuZ2xlOiA5MCxcbiAgICBzcHJlYWQ6IDQ1LFxuICAgIHN0YXJ0VmVsb2NpdHk6IDQ1LFxuICAgIGRlY2F5OiAwLjksXG4gICAgZ3Jhdml0eTogMSxcbiAgICBkcmlmdDogMCxcbiAgICB0aWNrczogMjAwLFxuICAgIHg6IDAuNSxcbiAgICB5OiAwLjUsXG4gICAgc2hhcGVzOiBbJ3NxdWFyZScsICdjaXJjbGUnXSxcbiAgICB6SW5kZXg6IDEwMCxcbiAgICBjb2xvcnM6IFtcbiAgICAgICcjMjZjY2ZmJyxcbiAgICAgICcjYTI1YWZkJyxcbiAgICAgICcjZmY1ZTdlJyxcbiAgICAgICcjODhmZjVhJyxcbiAgICAgICcjZmNmZjQyJyxcbiAgICAgICcjZmZhNjJkJyxcbiAgICAgICcjZmYzNmZmJ1xuICAgIF0sXG4gICAgLy8gcHJvYmFibHkgc2hvdWxkIGJlIHRydWUsIGJ1dCBiYWNrLWNvbXBhdFxuICAgIGRpc2FibGVGb3JSZWR1Y2VkTW90aW9uOiBmYWxzZSxcbiAgICBzY2FsYXI6IDFcbiAgfTtcblxuICBmdW5jdGlvbiBjb252ZXJ0KHZhbCwgdHJhbnNmb3JtKSB7XG4gICAgcmV0dXJuIHRyYW5zZm9ybSA/IHRyYW5zZm9ybSh2YWwpIDogdmFsO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNPayh2YWwpIHtcbiAgICByZXR1cm4gISh2YWwgPT09IG51bGwgfHwgdmFsID09PSB1bmRlZmluZWQpO1xuICB9XG5cbiAgZnVuY3Rpb24gcHJvcChvcHRpb25zLCBuYW1lLCB0cmFuc2Zvcm0pIHtcbiAgICByZXR1cm4gY29udmVydChcbiAgICAgIG9wdGlvbnMgJiYgaXNPayhvcHRpb25zW25hbWVdKSA/IG9wdGlvbnNbbmFtZV0gOiBkZWZhdWx0c1tuYW1lXSxcbiAgICAgIHRyYW5zZm9ybVxuICAgICk7XG4gIH1cblxuICBmdW5jdGlvbiBvbmx5UG9zaXRpdmVJbnQobnVtYmVyKXtcbiAgICByZXR1cm4gbnVtYmVyIDwgMCA/IDAgOiBNYXRoLmZsb29yKG51bWJlcik7XG4gIH1cblxuICBmdW5jdGlvbiByYW5kb21JbnQobWluLCBtYXgpIHtcbiAgICAvLyBbbWluLCBtYXgpXG4gICAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4pKSArIG1pbjtcbiAgfVxuXG4gIGZ1bmN0aW9uIHRvRGVjaW1hbChzdHIpIHtcbiAgICByZXR1cm4gcGFyc2VJbnQoc3RyLCAxNik7XG4gIH1cblxuICBmdW5jdGlvbiBjb2xvcnNUb1JnYihjb2xvcnMpIHtcbiAgICByZXR1cm4gY29sb3JzLm1hcChoZXhUb1JnYik7XG4gIH1cblxuICBmdW5jdGlvbiBoZXhUb1JnYihzdHIpIHtcbiAgICB2YXIgdmFsID0gU3RyaW5nKHN0cikucmVwbGFjZSgvW14wLTlhLWZdL2dpLCAnJyk7XG5cbiAgICBpZiAodmFsLmxlbmd0aCA8IDYpIHtcbiAgICAgICAgdmFsID0gdmFsWzBdK3ZhbFswXSt2YWxbMV0rdmFsWzFdK3ZhbFsyXSt2YWxbMl07XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHI6IHRvRGVjaW1hbCh2YWwuc3Vic3RyaW5nKDAsMikpLFxuICAgICAgZzogdG9EZWNpbWFsKHZhbC5zdWJzdHJpbmcoMiw0KSksXG4gICAgICBiOiB0b0RlY2ltYWwodmFsLnN1YnN0cmluZyg0LDYpKVxuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiBnZXRPcmlnaW4ob3B0aW9ucykge1xuICAgIHZhciBvcmlnaW4gPSBwcm9wKG9wdGlvbnMsICdvcmlnaW4nLCBPYmplY3QpO1xuICAgIG9yaWdpbi54ID0gcHJvcChvcmlnaW4sICd4JywgTnVtYmVyKTtcbiAgICBvcmlnaW4ueSA9IHByb3Aob3JpZ2luLCAneScsIE51bWJlcik7XG5cbiAgICByZXR1cm4gb3JpZ2luO1xuICB9XG5cbiAgZnVuY3Rpb24gc2V0Q2FudmFzV2luZG93U2l6ZShjYW52YXMpIHtcbiAgICBjYW52YXMud2lkdGggPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGg7XG4gICAgY2FudmFzLmhlaWdodCA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGllbnRIZWlnaHQ7XG4gIH1cblxuICBmdW5jdGlvbiBzZXRDYW52YXNSZWN0U2l6ZShjYW52YXMpIHtcbiAgICB2YXIgcmVjdCA9IGNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBjYW52YXMud2lkdGggPSByZWN0LndpZHRoO1xuICAgIGNhbnZhcy5oZWlnaHQgPSByZWN0LmhlaWdodDtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldENhbnZhcyh6SW5kZXgpIHtcbiAgICB2YXIgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG5cbiAgICBjYW52YXMuc3R5bGUucG9zaXRpb24gPSAnZml4ZWQnO1xuICAgIGNhbnZhcy5zdHlsZS50b3AgPSAnMHB4JztcbiAgICBjYW52YXMuc3R5bGUubGVmdCA9ICcwcHgnO1xuICAgIGNhbnZhcy5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ25vbmUnO1xuICAgIGNhbnZhcy5zdHlsZS56SW5kZXggPSB6SW5kZXg7XG5cbiAgICByZXR1cm4gY2FudmFzO1xuICB9XG5cbiAgZnVuY3Rpb24gZWxsaXBzZShjb250ZXh0LCB4LCB5LCByYWRpdXNYLCByYWRpdXNZLCByb3RhdGlvbiwgc3RhcnRBbmdsZSwgZW5kQW5nbGUsIGFudGlDbG9ja3dpc2UpIHtcbiAgICBjb250ZXh0LnNhdmUoKTtcbiAgICBjb250ZXh0LnRyYW5zbGF0ZSh4LCB5KTtcbiAgICBjb250ZXh0LnJvdGF0ZShyb3RhdGlvbik7XG4gICAgY29udGV4dC5zY2FsZShyYWRpdXNYLCByYWRpdXNZKTtcbiAgICBjb250ZXh0LmFyYygwLCAwLCAxLCBzdGFydEFuZ2xlLCBlbmRBbmdsZSwgYW50aUNsb2Nrd2lzZSk7XG4gICAgY29udGV4dC5yZXN0b3JlKCk7XG4gIH1cblxuICBmdW5jdGlvbiByYW5kb21QaHlzaWNzKG9wdHMpIHtcbiAgICB2YXIgcmFkQW5nbGUgPSBvcHRzLmFuZ2xlICogKE1hdGguUEkgLyAxODApO1xuICAgIHZhciByYWRTcHJlYWQgPSBvcHRzLnNwcmVhZCAqIChNYXRoLlBJIC8gMTgwKTtcblxuICAgIHJldHVybiB7XG4gICAgICB4OiBvcHRzLngsXG4gICAgICB5OiBvcHRzLnksXG4gICAgICB3b2JibGU6IE1hdGgucmFuZG9tKCkgKiAxMCxcbiAgICAgIHdvYmJsZVNwZWVkOiBNYXRoLm1pbigwLjExLCBNYXRoLnJhbmRvbSgpICogMC4xICsgMC4wNSksXG4gICAgICB2ZWxvY2l0eTogKG9wdHMuc3RhcnRWZWxvY2l0eSAqIDAuNSkgKyAoTWF0aC5yYW5kb20oKSAqIG9wdHMuc3RhcnRWZWxvY2l0eSksXG4gICAgICBhbmdsZTJEOiAtcmFkQW5nbGUgKyAoKDAuNSAqIHJhZFNwcmVhZCkgLSAoTWF0aC5yYW5kb20oKSAqIHJhZFNwcmVhZCkpLFxuICAgICAgdGlsdEFuZ2xlOiAoTWF0aC5yYW5kb20oKSAqICgwLjc1IC0gMC4yNSkgKyAwLjI1KSAqIE1hdGguUEksXG4gICAgICBjb2xvcjogb3B0cy5jb2xvcixcbiAgICAgIHNoYXBlOiBvcHRzLnNoYXBlLFxuICAgICAgdGljazogMCxcbiAgICAgIHRvdGFsVGlja3M6IG9wdHMudGlja3MsXG4gICAgICBkZWNheTogb3B0cy5kZWNheSxcbiAgICAgIGRyaWZ0OiBvcHRzLmRyaWZ0LFxuICAgICAgcmFuZG9tOiBNYXRoLnJhbmRvbSgpICsgMixcbiAgICAgIHRpbHRTaW46IDAsXG4gICAgICB0aWx0Q29zOiAwLFxuICAgICAgd29iYmxlWDogMCxcbiAgICAgIHdvYmJsZVk6IDAsXG4gICAgICBncmF2aXR5OiBvcHRzLmdyYXZpdHkgKiAzLFxuICAgICAgb3ZhbFNjYWxhcjogMC42LFxuICAgICAgc2NhbGFyOiBvcHRzLnNjYWxhcixcbiAgICAgIGZsYXQ6IG9wdHMuZmxhdFxuICAgIH07XG4gIH1cblxuICBmdW5jdGlvbiB1cGRhdGVGZXR0aShjb250ZXh0LCBmZXR0aSkge1xuICAgIGZldHRpLnggKz0gTWF0aC5jb3MoZmV0dGkuYW5nbGUyRCkgKiBmZXR0aS52ZWxvY2l0eSArIGZldHRpLmRyaWZ0O1xuICAgIGZldHRpLnkgKz0gTWF0aC5zaW4oZmV0dGkuYW5nbGUyRCkgKiBmZXR0aS52ZWxvY2l0eSArIGZldHRpLmdyYXZpdHk7XG4gICAgZmV0dGkudmVsb2NpdHkgKj0gZmV0dGkuZGVjYXk7XG5cbiAgICBpZiAoZmV0dGkuZmxhdCkge1xuICAgICAgZmV0dGkud29iYmxlID0gMDtcbiAgICAgIGZldHRpLndvYmJsZVggPSBmZXR0aS54ICsgKDEwICogZmV0dGkuc2NhbGFyKTtcbiAgICAgIGZldHRpLndvYmJsZVkgPSBmZXR0aS55ICsgKDEwICogZmV0dGkuc2NhbGFyKTtcblxuICAgICAgZmV0dGkudGlsdFNpbiA9IDA7XG4gICAgICBmZXR0aS50aWx0Q29zID0gMDtcbiAgICAgIGZldHRpLnJhbmRvbSA9IDE7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZldHRpLndvYmJsZSArPSBmZXR0aS53b2JibGVTcGVlZDtcbiAgICAgIGZldHRpLndvYmJsZVggPSBmZXR0aS54ICsgKCgxMCAqIGZldHRpLnNjYWxhcikgKiBNYXRoLmNvcyhmZXR0aS53b2JibGUpKTtcbiAgICAgIGZldHRpLndvYmJsZVkgPSBmZXR0aS55ICsgKCgxMCAqIGZldHRpLnNjYWxhcikgKiBNYXRoLnNpbihmZXR0aS53b2JibGUpKTtcblxuICAgICAgZmV0dGkudGlsdEFuZ2xlICs9IDAuMTtcbiAgICAgIGZldHRpLnRpbHRTaW4gPSBNYXRoLnNpbihmZXR0aS50aWx0QW5nbGUpO1xuICAgICAgZmV0dGkudGlsdENvcyA9IE1hdGguY29zKGZldHRpLnRpbHRBbmdsZSk7XG4gICAgICBmZXR0aS5yYW5kb20gPSBNYXRoLnJhbmRvbSgpICsgMjtcbiAgICB9XG5cbiAgICB2YXIgcHJvZ3Jlc3MgPSAoZmV0dGkudGljaysrKSAvIGZldHRpLnRvdGFsVGlja3M7XG5cbiAgICB2YXIgeDEgPSBmZXR0aS54ICsgKGZldHRpLnJhbmRvbSAqIGZldHRpLnRpbHRDb3MpO1xuICAgIHZhciB5MSA9IGZldHRpLnkgKyAoZmV0dGkucmFuZG9tICogZmV0dGkudGlsdFNpbik7XG4gICAgdmFyIHgyID0gZmV0dGkud29iYmxlWCArIChmZXR0aS5yYW5kb20gKiBmZXR0aS50aWx0Q29zKTtcbiAgICB2YXIgeTIgPSBmZXR0aS53b2JibGVZICsgKGZldHRpLnJhbmRvbSAqIGZldHRpLnRpbHRTaW4pO1xuXG4gICAgY29udGV4dC5maWxsU3R5bGUgPSAncmdiYSgnICsgZmV0dGkuY29sb3IuciArICcsICcgKyBmZXR0aS5jb2xvci5nICsgJywgJyArIGZldHRpLmNvbG9yLmIgKyAnLCAnICsgKDEgLSBwcm9ncmVzcykgKyAnKSc7XG5cbiAgICBjb250ZXh0LmJlZ2luUGF0aCgpO1xuXG4gICAgaWYgKGNhblVzZVBhdGhzICYmIGZldHRpLnNoYXBlLnR5cGUgPT09ICdwYXRoJyAmJiB0eXBlb2YgZmV0dGkuc2hhcGUucGF0aCA9PT0gJ3N0cmluZycgJiYgQXJyYXkuaXNBcnJheShmZXR0aS5zaGFwZS5tYXRyaXgpKSB7XG4gICAgICBjb250ZXh0LmZpbGwodHJhbnNmb3JtUGF0aDJEKFxuICAgICAgICBmZXR0aS5zaGFwZS5wYXRoLFxuICAgICAgICBmZXR0aS5zaGFwZS5tYXRyaXgsXG4gICAgICAgIGZldHRpLngsXG4gICAgICAgIGZldHRpLnksXG4gICAgICAgIE1hdGguYWJzKHgyIC0geDEpICogMC4xLFxuICAgICAgICBNYXRoLmFicyh5MiAtIHkxKSAqIDAuMSxcbiAgICAgICAgTWF0aC5QSSAvIDEwICogZmV0dGkud29iYmxlXG4gICAgICApKTtcbiAgICB9IGVsc2UgaWYgKGZldHRpLnNoYXBlLnR5cGUgPT09ICdiaXRtYXAnKSB7XG4gICAgICB2YXIgcm90YXRpb24gPSBNYXRoLlBJIC8gMTAgKiBmZXR0aS53b2JibGU7XG4gICAgICB2YXIgc2NhbGVYID0gTWF0aC5hYnMoeDIgLSB4MSkgKiAwLjE7XG4gICAgICB2YXIgc2NhbGVZID0gTWF0aC5hYnMoeTIgLSB5MSkgKiAwLjE7XG4gICAgICB2YXIgd2lkdGggPSBmZXR0aS5zaGFwZS5iaXRtYXAud2lkdGggKiBmZXR0aS5zY2FsYXI7XG4gICAgICB2YXIgaGVpZ2h0ID0gZmV0dGkuc2hhcGUuYml0bWFwLmhlaWdodCAqIGZldHRpLnNjYWxhcjtcblxuICAgICAgdmFyIG1hdHJpeCA9IG5ldyBET01NYXRyaXgoW1xuICAgICAgICBNYXRoLmNvcyhyb3RhdGlvbikgKiBzY2FsZVgsXG4gICAgICAgIE1hdGguc2luKHJvdGF0aW9uKSAqIHNjYWxlWCxcbiAgICAgICAgLU1hdGguc2luKHJvdGF0aW9uKSAqIHNjYWxlWSxcbiAgICAgICAgTWF0aC5jb3Mocm90YXRpb24pICogc2NhbGVZLFxuICAgICAgICBmZXR0aS54LFxuICAgICAgICBmZXR0aS55XG4gICAgICBdKTtcblxuICAgICAgLy8gYXBwbHkgdGhlIHRyYW5zZm9ybSBtYXRyaXggZnJvbSB0aGUgY29uZmV0dGkgc2hhcGVcbiAgICAgIG1hdHJpeC5tdWx0aXBseVNlbGYobmV3IERPTU1hdHJpeChmZXR0aS5zaGFwZS5tYXRyaXgpKTtcblxuICAgICAgdmFyIHBhdHRlcm4gPSBjb250ZXh0LmNyZWF0ZVBhdHRlcm4oYml0bWFwTWFwcGVyLnRyYW5zZm9ybShmZXR0aS5zaGFwZS5iaXRtYXApLCAnbm8tcmVwZWF0Jyk7XG4gICAgICBwYXR0ZXJuLnNldFRyYW5zZm9ybShtYXRyaXgpO1xuXG4gICAgICBjb250ZXh0Lmdsb2JhbEFscGhhID0gKDEgLSBwcm9ncmVzcyk7XG4gICAgICBjb250ZXh0LmZpbGxTdHlsZSA9IHBhdHRlcm47XG4gICAgICBjb250ZXh0LmZpbGxSZWN0KFxuICAgICAgICBmZXR0aS54IC0gKHdpZHRoIC8gMiksXG4gICAgICAgIGZldHRpLnkgLSAoaGVpZ2h0IC8gMiksXG4gICAgICAgIHdpZHRoLFxuICAgICAgICBoZWlnaHRcbiAgICAgICk7XG4gICAgICBjb250ZXh0Lmdsb2JhbEFscGhhID0gMTtcbiAgICB9IGVsc2UgaWYgKGZldHRpLnNoYXBlID09PSAnY2lyY2xlJykge1xuICAgICAgY29udGV4dC5lbGxpcHNlID9cbiAgICAgICAgY29udGV4dC5lbGxpcHNlKGZldHRpLngsIGZldHRpLnksIE1hdGguYWJzKHgyIC0geDEpICogZmV0dGkub3ZhbFNjYWxhciwgTWF0aC5hYnMoeTIgLSB5MSkgKiBmZXR0aS5vdmFsU2NhbGFyLCBNYXRoLlBJIC8gMTAgKiBmZXR0aS53b2JibGUsIDAsIDIgKiBNYXRoLlBJKSA6XG4gICAgICAgIGVsbGlwc2UoY29udGV4dCwgZmV0dGkueCwgZmV0dGkueSwgTWF0aC5hYnMoeDIgLSB4MSkgKiBmZXR0aS5vdmFsU2NhbGFyLCBNYXRoLmFicyh5MiAtIHkxKSAqIGZldHRpLm92YWxTY2FsYXIsIE1hdGguUEkgLyAxMCAqIGZldHRpLndvYmJsZSwgMCwgMiAqIE1hdGguUEkpO1xuICAgIH0gZWxzZSBpZiAoZmV0dGkuc2hhcGUgPT09ICdzdGFyJykge1xuICAgICAgdmFyIHJvdCA9IE1hdGguUEkgLyAyICogMztcbiAgICAgIHZhciBpbm5lclJhZGl1cyA9IDQgKiBmZXR0aS5zY2FsYXI7XG4gICAgICB2YXIgb3V0ZXJSYWRpdXMgPSA4ICogZmV0dGkuc2NhbGFyO1xuICAgICAgdmFyIHggPSBmZXR0aS54O1xuICAgICAgdmFyIHkgPSBmZXR0aS55O1xuICAgICAgdmFyIHNwaWtlcyA9IDU7XG4gICAgICB2YXIgc3RlcCA9IE1hdGguUEkgLyBzcGlrZXM7XG5cbiAgICAgIHdoaWxlIChzcGlrZXMtLSkge1xuICAgICAgICB4ID0gZmV0dGkueCArIE1hdGguY29zKHJvdCkgKiBvdXRlclJhZGl1cztcbiAgICAgICAgeSA9IGZldHRpLnkgKyBNYXRoLnNpbihyb3QpICogb3V0ZXJSYWRpdXM7XG4gICAgICAgIGNvbnRleHQubGluZVRvKHgsIHkpO1xuICAgICAgICByb3QgKz0gc3RlcDtcblxuICAgICAgICB4ID0gZmV0dGkueCArIE1hdGguY29zKHJvdCkgKiBpbm5lclJhZGl1cztcbiAgICAgICAgeSA9IGZldHRpLnkgKyBNYXRoLnNpbihyb3QpICogaW5uZXJSYWRpdXM7XG4gICAgICAgIGNvbnRleHQubGluZVRvKHgsIHkpO1xuICAgICAgICByb3QgKz0gc3RlcDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29udGV4dC5tb3ZlVG8oTWF0aC5mbG9vcihmZXR0aS54KSwgTWF0aC5mbG9vcihmZXR0aS55KSk7XG4gICAgICBjb250ZXh0LmxpbmVUbyhNYXRoLmZsb29yKGZldHRpLndvYmJsZVgpLCBNYXRoLmZsb29yKHkxKSk7XG4gICAgICBjb250ZXh0LmxpbmVUbyhNYXRoLmZsb29yKHgyKSwgTWF0aC5mbG9vcih5MikpO1xuICAgICAgY29udGV4dC5saW5lVG8oTWF0aC5mbG9vcih4MSksIE1hdGguZmxvb3IoZmV0dGkud29iYmxlWSkpO1xuICAgIH1cblxuICAgIGNvbnRleHQuY2xvc2VQYXRoKCk7XG4gICAgY29udGV4dC5maWxsKCk7XG5cbiAgICByZXR1cm4gZmV0dGkudGljayA8IGZldHRpLnRvdGFsVGlja3M7XG4gIH1cblxuICBmdW5jdGlvbiBhbmltYXRlKGNhbnZhcywgZmV0dGlzLCByZXNpemVyLCBzaXplLCBkb25lKSB7XG4gICAgdmFyIGFuaW1hdGluZ0ZldHRpcyA9IGZldHRpcy5zbGljZSgpO1xuICAgIHZhciBjb250ZXh0ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG4gICAgdmFyIGFuaW1hdGlvbkZyYW1lO1xuICAgIHZhciBkZXN0cm95O1xuXG4gICAgdmFyIHByb20gPSBwcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlKSB7XG4gICAgICBmdW5jdGlvbiBvbkRvbmUoKSB7XG4gICAgICAgIGFuaW1hdGlvbkZyYW1lID0gZGVzdHJveSA9IG51bGw7XG5cbiAgICAgICAgY29udGV4dC5jbGVhclJlY3QoMCwgMCwgc2l6ZS53aWR0aCwgc2l6ZS5oZWlnaHQpO1xuICAgICAgICBiaXRtYXBNYXBwZXIuY2xlYXIoKTtcblxuICAgICAgICBkb25lKCk7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gdXBkYXRlKCkge1xuICAgICAgICBpZiAoaXNXb3JrZXIgJiYgIShzaXplLndpZHRoID09PSB3b3JrZXJTaXplLndpZHRoICYmIHNpemUuaGVpZ2h0ID09PSB3b3JrZXJTaXplLmhlaWdodCkpIHtcbiAgICAgICAgICBzaXplLndpZHRoID0gY2FudmFzLndpZHRoID0gd29ya2VyU2l6ZS53aWR0aDtcbiAgICAgICAgICBzaXplLmhlaWdodCA9IGNhbnZhcy5oZWlnaHQgPSB3b3JrZXJTaXplLmhlaWdodDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghc2l6ZS53aWR0aCAmJiAhc2l6ZS5oZWlnaHQpIHtcbiAgICAgICAgICByZXNpemVyKGNhbnZhcyk7XG4gICAgICAgICAgc2l6ZS53aWR0aCA9IGNhbnZhcy53aWR0aDtcbiAgICAgICAgICBzaXplLmhlaWdodCA9IGNhbnZhcy5oZWlnaHQ7XG4gICAgICAgIH1cblxuICAgICAgICBjb250ZXh0LmNsZWFyUmVjdCgwLCAwLCBzaXplLndpZHRoLCBzaXplLmhlaWdodCk7XG5cbiAgICAgICAgYW5pbWF0aW5nRmV0dGlzID0gYW5pbWF0aW5nRmV0dGlzLmZpbHRlcihmdW5jdGlvbiAoZmV0dGkpIHtcbiAgICAgICAgICByZXR1cm4gdXBkYXRlRmV0dGkoY29udGV4dCwgZmV0dGkpO1xuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoYW5pbWF0aW5nRmV0dGlzLmxlbmd0aCkge1xuICAgICAgICAgIGFuaW1hdGlvbkZyYW1lID0gcmFmLmZyYW1lKHVwZGF0ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgb25Eb25lKCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgYW5pbWF0aW9uRnJhbWUgPSByYWYuZnJhbWUodXBkYXRlKTtcbiAgICAgIGRlc3Ryb3kgPSBvbkRvbmU7XG4gICAgfSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgYWRkRmV0dGlzOiBmdW5jdGlvbiAoZmV0dGlzKSB7XG4gICAgICAgIGFuaW1hdGluZ0ZldHRpcyA9IGFuaW1hdGluZ0ZldHRpcy5jb25jYXQoZmV0dGlzKTtcblxuICAgICAgICByZXR1cm4gcHJvbTtcbiAgICAgIH0sXG4gICAgICBjYW52YXM6IGNhbnZhcyxcbiAgICAgIHByb21pc2U6IHByb20sXG4gICAgICByZXNldDogZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoYW5pbWF0aW9uRnJhbWUpIHtcbiAgICAgICAgICByYWYuY2FuY2VsKGFuaW1hdGlvbkZyYW1lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChkZXN0cm95KSB7XG4gICAgICAgICAgZGVzdHJveSgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNvbmZldHRpQ2Fubm9uKGNhbnZhcywgZ2xvYmFsT3B0cykge1xuICAgIHZhciBpc0xpYkNhbnZhcyA9ICFjYW52YXM7XG4gICAgdmFyIGFsbG93UmVzaXplID0gISFwcm9wKGdsb2JhbE9wdHMgfHwge30sICdyZXNpemUnKTtcbiAgICB2YXIgaGFzUmVzaXplRXZlbnRSZWdpc3RlcmVkID0gZmFsc2U7XG4gICAgdmFyIGdsb2JhbERpc2FibGVGb3JSZWR1Y2VkTW90aW9uID0gcHJvcChnbG9iYWxPcHRzLCAnZGlzYWJsZUZvclJlZHVjZWRNb3Rpb24nLCBCb29sZWFuKTtcbiAgICB2YXIgc2hvdWxkVXNlV29ya2VyID0gY2FuVXNlV29ya2VyICYmICEhcHJvcChnbG9iYWxPcHRzIHx8IHt9LCAndXNlV29ya2VyJyk7XG4gICAgdmFyIHdvcmtlciA9IHNob3VsZFVzZVdvcmtlciA/IGdldFdvcmtlcigpIDogbnVsbDtcbiAgICB2YXIgcmVzaXplciA9IGlzTGliQ2FudmFzID8gc2V0Q2FudmFzV2luZG93U2l6ZSA6IHNldENhbnZhc1JlY3RTaXplO1xuICAgIHZhciBpbml0aWFsaXplZCA9IChjYW52YXMgJiYgd29ya2VyKSA/ICEhY2FudmFzLl9fY29uZmV0dGlfaW5pdGlhbGl6ZWQgOiBmYWxzZTtcbiAgICB2YXIgcHJlZmVyTGVzc01vdGlvbiA9IHR5cGVvZiBtYXRjaE1lZGlhID09PSAnZnVuY3Rpb24nICYmIG1hdGNoTWVkaWEoJyhwcmVmZXJzLXJlZHVjZWQtbW90aW9uKScpLm1hdGNoZXM7XG4gICAgdmFyIGFuaW1hdGlvbk9iajtcblxuICAgIGZ1bmN0aW9uIGZpcmVMb2NhbChvcHRpb25zLCBzaXplLCBkb25lKSB7XG4gICAgICB2YXIgcGFydGljbGVDb3VudCA9IHByb3Aob3B0aW9ucywgJ3BhcnRpY2xlQ291bnQnLCBvbmx5UG9zaXRpdmVJbnQpO1xuICAgICAgdmFyIGFuZ2xlID0gcHJvcChvcHRpb25zLCAnYW5nbGUnLCBOdW1iZXIpO1xuICAgICAgdmFyIHNwcmVhZCA9IHByb3Aob3B0aW9ucywgJ3NwcmVhZCcsIE51bWJlcik7XG4gICAgICB2YXIgc3RhcnRWZWxvY2l0eSA9IHByb3Aob3B0aW9ucywgJ3N0YXJ0VmVsb2NpdHknLCBOdW1iZXIpO1xuICAgICAgdmFyIGRlY2F5ID0gcHJvcChvcHRpb25zLCAnZGVjYXknLCBOdW1iZXIpO1xuICAgICAgdmFyIGdyYXZpdHkgPSBwcm9wKG9wdGlvbnMsICdncmF2aXR5JywgTnVtYmVyKTtcbiAgICAgIHZhciBkcmlmdCA9IHByb3Aob3B0aW9ucywgJ2RyaWZ0JywgTnVtYmVyKTtcbiAgICAgIHZhciBjb2xvcnMgPSBwcm9wKG9wdGlvbnMsICdjb2xvcnMnLCBjb2xvcnNUb1JnYik7XG4gICAgICB2YXIgdGlja3MgPSBwcm9wKG9wdGlvbnMsICd0aWNrcycsIE51bWJlcik7XG4gICAgICB2YXIgc2hhcGVzID0gcHJvcChvcHRpb25zLCAnc2hhcGVzJyk7XG4gICAgICB2YXIgc2NhbGFyID0gcHJvcChvcHRpb25zLCAnc2NhbGFyJyk7XG4gICAgICB2YXIgZmxhdCA9ICEhcHJvcChvcHRpb25zLCAnZmxhdCcpO1xuICAgICAgdmFyIG9yaWdpbiA9IGdldE9yaWdpbihvcHRpb25zKTtcblxuICAgICAgdmFyIHRlbXAgPSBwYXJ0aWNsZUNvdW50O1xuICAgICAgdmFyIGZldHRpcyA9IFtdO1xuXG4gICAgICB2YXIgc3RhcnRYID0gY2FudmFzLndpZHRoICogb3JpZ2luLng7XG4gICAgICB2YXIgc3RhcnRZID0gY2FudmFzLmhlaWdodCAqIG9yaWdpbi55O1xuXG4gICAgICB3aGlsZSAodGVtcC0tKSB7XG4gICAgICAgIGZldHRpcy5wdXNoKFxuICAgICAgICAgIHJhbmRvbVBoeXNpY3Moe1xuICAgICAgICAgICAgeDogc3RhcnRYLFxuICAgICAgICAgICAgeTogc3RhcnRZLFxuICAgICAgICAgICAgYW5nbGU6IGFuZ2xlLFxuICAgICAgICAgICAgc3ByZWFkOiBzcHJlYWQsXG4gICAgICAgICAgICBzdGFydFZlbG9jaXR5OiBzdGFydFZlbG9jaXR5LFxuICAgICAgICAgICAgY29sb3I6IGNvbG9yc1t0ZW1wICUgY29sb3JzLmxlbmd0aF0sXG4gICAgICAgICAgICBzaGFwZTogc2hhcGVzW3JhbmRvbUludCgwLCBzaGFwZXMubGVuZ3RoKV0sXG4gICAgICAgICAgICB0aWNrczogdGlja3MsXG4gICAgICAgICAgICBkZWNheTogZGVjYXksXG4gICAgICAgICAgICBncmF2aXR5OiBncmF2aXR5LFxuICAgICAgICAgICAgZHJpZnQ6IGRyaWZ0LFxuICAgICAgICAgICAgc2NhbGFyOiBzY2FsYXIsXG4gICAgICAgICAgICBmbGF0OiBmbGF0XG4gICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgLy8gaWYgd2UgaGF2ZSBhIHByZXZpb3VzIGNhbnZhcyBhbHJlYWR5IGFuaW1hdGluZyxcbiAgICAgIC8vIGFkZCB0byBpdFxuICAgICAgaWYgKGFuaW1hdGlvbk9iaikge1xuICAgICAgICByZXR1cm4gYW5pbWF0aW9uT2JqLmFkZEZldHRpcyhmZXR0aXMpO1xuICAgICAgfVxuXG4gICAgICBhbmltYXRpb25PYmogPSBhbmltYXRlKGNhbnZhcywgZmV0dGlzLCByZXNpemVyLCBzaXplICwgZG9uZSk7XG5cbiAgICAgIHJldHVybiBhbmltYXRpb25PYmoucHJvbWlzZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaXJlKG9wdGlvbnMpIHtcbiAgICAgIHZhciBkaXNhYmxlRm9yUmVkdWNlZE1vdGlvbiA9IGdsb2JhbERpc2FibGVGb3JSZWR1Y2VkTW90aW9uIHx8IHByb3Aob3B0aW9ucywgJ2Rpc2FibGVGb3JSZWR1Y2VkTW90aW9uJywgQm9vbGVhbik7XG4gICAgICB2YXIgekluZGV4ID0gcHJvcChvcHRpb25zLCAnekluZGV4JywgTnVtYmVyKTtcblxuICAgICAgaWYgKGRpc2FibGVGb3JSZWR1Y2VkTW90aW9uICYmIHByZWZlckxlc3NNb3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIHByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUpIHtcbiAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoaXNMaWJDYW52YXMgJiYgYW5pbWF0aW9uT2JqKSB7XG4gICAgICAgIC8vIHVzZSBleGlzdGluZyBjYW52YXMgZnJvbSBpbi1wcm9ncmVzcyBhbmltYXRpb25cbiAgICAgICAgY2FudmFzID0gYW5pbWF0aW9uT2JqLmNhbnZhcztcbiAgICAgIH0gZWxzZSBpZiAoaXNMaWJDYW52YXMgJiYgIWNhbnZhcykge1xuICAgICAgICAvLyBjcmVhdGUgYW5kIGluaXRpYWxpemUgYSBuZXcgY2FudmFzXG4gICAgICAgIGNhbnZhcyA9IGdldENhbnZhcyh6SW5kZXgpO1xuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNhbnZhcyk7XG4gICAgICB9XG5cbiAgICAgIGlmIChhbGxvd1Jlc2l6ZSAmJiAhaW5pdGlhbGl6ZWQpIHtcbiAgICAgICAgLy8gaW5pdGlhbGl6ZSB0aGUgc2l6ZSBvZiBhIHVzZXItc3VwcGxpZWQgY2FudmFzXG4gICAgICAgIHJlc2l6ZXIoY2FudmFzKTtcbiAgICAgIH1cblxuICAgICAgdmFyIHNpemUgPSB7XG4gICAgICAgIHdpZHRoOiBjYW52YXMud2lkdGgsXG4gICAgICAgIGhlaWdodDogY2FudmFzLmhlaWdodFxuICAgICAgfTtcblxuICAgICAgaWYgKHdvcmtlciAmJiAhaW5pdGlhbGl6ZWQpIHtcbiAgICAgICAgd29ya2VyLmluaXQoY2FudmFzKTtcbiAgICAgIH1cblxuICAgICAgaW5pdGlhbGl6ZWQgPSB0cnVlO1xuXG4gICAgICBpZiAod29ya2VyKSB7XG4gICAgICAgIGNhbnZhcy5fX2NvbmZldHRpX2luaXRpYWxpemVkID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gb25SZXNpemUoKSB7XG4gICAgICAgIGlmICh3b3JrZXIpIHtcbiAgICAgICAgICAvLyBUT0RPIHRoaXMgcmVhbGx5IHNob3VsZG4ndCBiZSBpbW1lZGlhdGUsIGJlY2F1c2UgaXQgaXMgZXhwZW5zaXZlXG4gICAgICAgICAgdmFyIG9iaiA9IHtcbiAgICAgICAgICAgIGdldEJvdW5kaW5nQ2xpZW50UmVjdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICBpZiAoIWlzTGliQ2FudmFzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG5cbiAgICAgICAgICByZXNpemVyKG9iaik7XG5cbiAgICAgICAgICB3b3JrZXIucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgcmVzaXplOiB7XG4gICAgICAgICAgICAgIHdpZHRoOiBvYmoud2lkdGgsXG4gICAgICAgICAgICAgIGhlaWdodDogb2JqLmhlaWdodFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGRvbid0IGFjdHVhbGx5IHF1ZXJ5IHRoZSBzaXplIGhlcmUsIHNpbmNlIHRoaXNcbiAgICAgICAgLy8gY2FuIGV4ZWN1dGUgZnJlcXVlbnRseSBhbmQgcmFwaWRseVxuICAgICAgICBzaXplLndpZHRoID0gc2l6ZS5oZWlnaHQgPSBudWxsO1xuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBkb25lKCkge1xuICAgICAgICBhbmltYXRpb25PYmogPSBudWxsO1xuXG4gICAgICAgIGlmIChhbGxvd1Jlc2l6ZSkge1xuICAgICAgICAgIGhhc1Jlc2l6ZUV2ZW50UmVnaXN0ZXJlZCA9IGZhbHNlO1xuICAgICAgICAgIGdsb2JhbC5yZW1vdmVFdmVudExpc3RlbmVyKCdyZXNpemUnLCBvblJlc2l6ZSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNMaWJDYW52YXMgJiYgY2FudmFzKSB7XG4gICAgICAgICAgaWYgKGRvY3VtZW50LmJvZHkuY29udGFpbnMoY2FudmFzKSkge1xuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZChjYW52YXMpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjYW52YXMgPSBudWxsO1xuICAgICAgICAgIGluaXRpYWxpemVkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGFsbG93UmVzaXplICYmICFoYXNSZXNpemVFdmVudFJlZ2lzdGVyZWQpIHtcbiAgICAgICAgaGFzUmVzaXplRXZlbnRSZWdpc3RlcmVkID0gdHJ1ZTtcbiAgICAgICAgZ2xvYmFsLmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIG9uUmVzaXplLCBmYWxzZSk7XG4gICAgICB9XG5cbiAgICAgIGlmICh3b3JrZXIpIHtcbiAgICAgICAgcmV0dXJuIHdvcmtlci5maXJlKG9wdGlvbnMsIHNpemUsIGRvbmUpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gZmlyZUxvY2FsKG9wdGlvbnMsIHNpemUsIGRvbmUpO1xuICAgIH1cblxuICAgIGZpcmUucmVzZXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAod29ya2VyKSB7XG4gICAgICAgIHdvcmtlci5yZXNldCgpO1xuICAgICAgfVxuXG4gICAgICBpZiAoYW5pbWF0aW9uT2JqKSB7XG4gICAgICAgIGFuaW1hdGlvbk9iai5yZXNldCgpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gZmlyZTtcbiAgfVxuXG4gIC8vIE1ha2UgZGVmYXVsdCBleHBvcnQgbGF6eSB0byBkZWZlciB3b3JrZXIgY3JlYXRpb24gdW50aWwgY2FsbGVkLlxuICB2YXIgZGVmYXVsdEZpcmU7XG4gIGZ1bmN0aW9uIGdldERlZmF1bHRGaXJlKCkge1xuICAgIGlmICghZGVmYXVsdEZpcmUpIHtcbiAgICAgIGRlZmF1bHRGaXJlID0gY29uZmV0dGlDYW5ub24obnVsbCwgeyB1c2VXb3JrZXI6IHRydWUsIHJlc2l6ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgcmV0dXJuIGRlZmF1bHRGaXJlO1xuICB9XG5cbiAgZnVuY3Rpb24gdHJhbnNmb3JtUGF0aDJEKHBhdGhTdHJpbmcsIHBhdGhNYXRyaXgsIHgsIHksIHNjYWxlWCwgc2NhbGVZLCByb3RhdGlvbikge1xuICAgIHZhciBwYXRoMmQgPSBuZXcgUGF0aDJEKHBhdGhTdHJpbmcpO1xuXG4gICAgdmFyIHQxID0gbmV3IFBhdGgyRCgpO1xuICAgIHQxLmFkZFBhdGgocGF0aDJkLCBuZXcgRE9NTWF0cml4KHBhdGhNYXRyaXgpKTtcblxuICAgIHZhciB0MiA9IG5ldyBQYXRoMkQoKTtcbiAgICAvLyBzZWUgaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0RPTU1hdHJpeC9ET01NYXRyaXhcbiAgICB0Mi5hZGRQYXRoKHQxLCBuZXcgRE9NTWF0cml4KFtcbiAgICAgIE1hdGguY29zKHJvdGF0aW9uKSAqIHNjYWxlWCxcbiAgICAgIE1hdGguc2luKHJvdGF0aW9uKSAqIHNjYWxlWCxcbiAgICAgIC1NYXRoLnNpbihyb3RhdGlvbikgKiBzY2FsZVksXG4gICAgICBNYXRoLmNvcyhyb3RhdGlvbikgKiBzY2FsZVksXG4gICAgICB4LFxuICAgICAgeVxuICAgIF0pKTtcblxuICAgIHJldHVybiB0MjtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNoYXBlRnJvbVBhdGgocGF0aERhdGEpIHtcbiAgICBpZiAoIWNhblVzZVBhdGhzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3BhdGggY29uZmV0dGkgYXJlIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyJyk7XG4gICAgfVxuXG4gICAgdmFyIHBhdGgsIG1hdHJpeDtcblxuICAgIGlmICh0eXBlb2YgcGF0aERhdGEgPT09ICdzdHJpbmcnKSB7XG4gICAgICBwYXRoID0gcGF0aERhdGE7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhdGggPSBwYXRoRGF0YS5wYXRoO1xuICAgICAgbWF0cml4ID0gcGF0aERhdGEubWF0cml4O1xuICAgIH1cblxuICAgIHZhciBwYXRoMmQgPSBuZXcgUGF0aDJEKHBhdGgpO1xuICAgIHZhciB0ZW1wQ2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG4gICAgdmFyIHRlbXBDdHggPSB0ZW1wQ2FudmFzLmdldENvbnRleHQoJzJkJyk7XG5cbiAgICBpZiAoIW1hdHJpeCkge1xuICAgICAgLy8gYXR0ZW1wdCB0byBmaWd1cmUgb3V0IHRoZSB3aWR0aCBvZiB0aGUgcGF0aCwgdXAgdG8gMTAwMHgxMDAwXG4gICAgICB2YXIgbWF4U2l6ZSA9IDEwMDA7XG4gICAgICB2YXIgbWluWCA9IG1heFNpemU7XG4gICAgICB2YXIgbWluWSA9IG1heFNpemU7XG4gICAgICB2YXIgbWF4WCA9IDA7XG4gICAgICB2YXIgbWF4WSA9IDA7XG4gICAgICB2YXIgd2lkdGgsIGhlaWdodDtcblxuICAgICAgLy8gZG8gc29tZSBsaW5lIHNraXBwaW5nLi4uIHRoaXMgaXMgZmFzdGVyIHRoYW4gY2hlY2tpbmdcbiAgICAgIC8vIGV2ZXJ5IHBpeGVsIGFuZCB3aWxsIGJlIG1vc3RseSBzdGlsbCBjb3JyZWN0XG4gICAgICBmb3IgKHZhciB4ID0gMDsgeCA8IG1heFNpemU7IHggKz0gMikge1xuICAgICAgICBmb3IgKHZhciB5ID0gMDsgeSA8IG1heFNpemU7IHkgKz0gMikge1xuICAgICAgICAgIGlmICh0ZW1wQ3R4LmlzUG9pbnRJblBhdGgocGF0aDJkLCB4LCB5LCAnbm9uemVybycpKSB7XG4gICAgICAgICAgICBtaW5YID0gTWF0aC5taW4obWluWCwgeCk7XG4gICAgICAgICAgICBtaW5ZID0gTWF0aC5taW4obWluWSwgeSk7XG4gICAgICAgICAgICBtYXhYID0gTWF0aC5tYXgobWF4WCwgeCk7XG4gICAgICAgICAgICBtYXhZID0gTWF0aC5tYXgobWF4WSwgeSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHdpZHRoID0gbWF4WCAtIG1pblg7XG4gICAgICBoZWlnaHQgPSBtYXhZIC0gbWluWTtcblxuICAgICAgdmFyIG1heERlc2lyZWRTaXplID0gMTA7XG4gICAgICB2YXIgc2NhbGUgPSBNYXRoLm1pbihtYXhEZXNpcmVkU2l6ZS93aWR0aCwgbWF4RGVzaXJlZFNpemUvaGVpZ2h0KTtcblxuICAgICAgbWF0cml4ID0gW1xuICAgICAgICBzY2FsZSwgMCwgMCwgc2NhbGUsXG4gICAgICAgIC1NYXRoLnJvdW5kKCh3aWR0aC8yKSArIG1pblgpICogc2NhbGUsXG4gICAgICAgIC1NYXRoLnJvdW5kKChoZWlnaHQvMikgKyBtaW5ZKSAqIHNjYWxlXG4gICAgICBdO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiAncGF0aCcsXG4gICAgICBwYXRoOiBwYXRoLFxuICAgICAgbWF0cml4OiBtYXRyaXhcbiAgICB9O1xuICB9XG5cbiAgZnVuY3Rpb24gc2hhcGVGcm9tVGV4dCh0ZXh0RGF0YSkge1xuICAgIHZhciB0ZXh0LFxuICAgICAgICBzY2FsYXIgPSAxLFxuICAgICAgICBjb2xvciA9ICcjMDAwMDAwJyxcbiAgICAgICAgLy8gc2VlIGh0dHBzOi8vbm9sYW5sYXdzb24uY29tLzIwMjIvMDQvMDgvdGhlLXN0cnVnZ2xlLW9mLXVzaW5nLW5hdGl2ZS1lbW9qaS1vbi10aGUtd2ViL1xuICAgICAgICBmb250RmFtaWx5ID0gJ1wiQXBwbGUgQ29sb3IgRW1vamlcIiwgXCJTZWdvZSBVSSBFbW9qaVwiLCBcIlNlZ29lIFVJIFN5bWJvbFwiLCBcIk5vdG8gQ29sb3IgRW1vamlcIiwgXCJFbW9qaU9uZSBDb2xvclwiLCBcIkFuZHJvaWQgRW1vamlcIiwgXCJUd2Vtb2ppIE1vemlsbGFcIiwgXCJzeXN0ZW0gZW1vamlcIiwgc2Fucy1zZXJpZic7XG5cbiAgICBpZiAodHlwZW9mIHRleHREYXRhID09PSAnc3RyaW5nJykge1xuICAgICAgdGV4dCA9IHRleHREYXRhO1xuICAgIH0gZWxzZSB7XG4gICAgICB0ZXh0ID0gdGV4dERhdGEudGV4dDtcbiAgICAgIHNjYWxhciA9ICdzY2FsYXInIGluIHRleHREYXRhID8gdGV4dERhdGEuc2NhbGFyIDogc2NhbGFyO1xuICAgICAgZm9udEZhbWlseSA9ICdmb250RmFtaWx5JyBpbiB0ZXh0RGF0YSA/IHRleHREYXRhLmZvbnRGYW1pbHkgOiBmb250RmFtaWx5O1xuICAgICAgY29sb3IgPSAnY29sb3InIGluIHRleHREYXRhID8gdGV4dERhdGEuY29sb3IgOiBjb2xvcjtcbiAgICB9XG5cbiAgICAvLyBhbGwgb3RoZXIgY29uZmV0dGkgYXJlIDEwIHBpeGVscyxcbiAgICAvLyBzbyB0aGlzIHBpeGVsIHNpemUgaXMgdGhlIGRlLWZhY3RvIDEwMCUgc2NhbGUgY29uZmV0dGlcbiAgICB2YXIgZm9udFNpemUgPSAxMCAqIHNjYWxhcjtcbiAgICB2YXIgZm9udCA9ICcnICsgZm9udFNpemUgKyAncHggJyArIGZvbnRGYW1pbHk7XG5cbiAgICB2YXIgY2FudmFzID0gbmV3IE9mZnNjcmVlbkNhbnZhcyhmb250U2l6ZSwgZm9udFNpemUpO1xuICAgIHZhciBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcblxuICAgIGN0eC5mb250ID0gZm9udDtcbiAgICB2YXIgc2l6ZSA9IGN0eC5tZWFzdXJlVGV4dCh0ZXh0KTtcbiAgICB2YXIgd2lkdGggPSBNYXRoLmNlaWwoc2l6ZS5hY3R1YWxCb3VuZGluZ0JveFJpZ2h0ICsgc2l6ZS5hY3R1YWxCb3VuZGluZ0JveExlZnQpO1xuICAgIHZhciBoZWlnaHQgPSBNYXRoLmNlaWwoc2l6ZS5hY3R1YWxCb3VuZGluZ0JveEFzY2VudCArIHNpemUuYWN0dWFsQm91bmRpbmdCb3hEZXNjZW50KTtcblxuICAgIHZhciBwYWRkaW5nID0gMjtcbiAgICB2YXIgeCA9IHNpemUuYWN0dWFsQm91bmRpbmdCb3hMZWZ0ICsgcGFkZGluZztcbiAgICB2YXIgeSA9IHNpemUuYWN0dWFsQm91bmRpbmdCb3hBc2NlbnQgKyBwYWRkaW5nO1xuICAgIHdpZHRoICs9IHBhZGRpbmcgKyBwYWRkaW5nO1xuICAgIGhlaWdodCArPSBwYWRkaW5nICsgcGFkZGluZztcblxuICAgIGNhbnZhcyA9IG5ldyBPZmZzY3JlZW5DYW52YXMod2lkdGgsIGhlaWdodCk7XG4gICAgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG4gICAgY3R4LmZvbnQgPSBmb250O1xuICAgIGN0eC5maWxsU3R5bGUgPSBjb2xvcjtcblxuICAgIGN0eC5maWxsVGV4dCh0ZXh0LCB4LCB5KTtcblxuICAgIHZhciBzY2FsZSA9IDEgLyBzY2FsYXI7XG5cbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogJ2JpdG1hcCcsXG4gICAgICAvLyBUT0RPIHRoZXNlIHByb2JhYmx5IG5lZWQgdG8gYmUgdHJhbnNmZXJlZCBmb3Igd29ya2Vyc1xuICAgICAgYml0bWFwOiBjYW52YXMudHJhbnNmZXJUb0ltYWdlQml0bWFwKCksXG4gICAgICBtYXRyaXg6IFtzY2FsZSwgMCwgMCwgc2NhbGUsIC13aWR0aCAqIHNjYWxlIC8gMiwgLWhlaWdodCAqIHNjYWxlIC8gMl1cbiAgICB9O1xuICB9XG5cbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gZ2V0RGVmYXVsdEZpcmUoKS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9O1xuICBtb2R1bGUuZXhwb3J0cy5yZXNldCA9IGZ1bmN0aW9uKCkge1xuICAgIGdldERlZmF1bHRGaXJlKCkucmVzZXQoKTtcbiAgfTtcbiAgbW9kdWxlLmV4cG9ydHMuY3JlYXRlID0gY29uZmV0dGlDYW5ub247XG4gIG1vZHVsZS5leHBvcnRzLnNoYXBlRnJvbVBhdGggPSBzaGFwZUZyb21QYXRoO1xuICBtb2R1bGUuZXhwb3J0cy5zaGFwZUZyb21UZXh0ID0gc2hhcGVGcm9tVGV4dDtcbn0oKGZ1bmN0aW9uICgpIHtcbiAgaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIHdpbmRvdztcbiAgfVxuXG4gIGlmICh0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm4gc2VsZjtcbiAgfVxuXG4gIHJldHVybiB0aGlzIHx8IHt9O1xufSkoKSwgbW9kdWxlLCBmYWxzZSkpO1xuXG4vLyBlbmQgc291cmNlIGNvbnRlbnRcblxuZXhwb3J0IGRlZmF1bHQgbW9kdWxlLmV4cG9ydHM7XG5leHBvcnQgdmFyIGNyZWF0ZSA9IG1vZHVsZS5leHBvcnRzLmNyZWF0ZTtcbiJdLCJtYXBwaW5ncyI6IjtBQUNBLElBQUksU0FBUyxDQUFDO0NBS2IsU0FBUyxLQUFLLFFBQVEsUUFBUSxVQUFVLFlBQVk7Q0FDbkQsSUFBSSxlQUFlLENBQUMsRUFDbEIsT0FBTyxVQUNQLE9BQU8sUUFDUCxPQUFPLFdBQ1AsT0FBTyxtQkFDUCxP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