(function () {
  'use strict';
  if (window.KWEaglerCloud && window.KWEaglerCloud.ready) return;
  window.KWEaglerCloud = {
    ready: import('/js/eagler-cloud-save.js')
      .then(function (module) { return module.initializeEaglerCloudSave(); })
      .catch(function (error) {
        console.warn('Could not load Eaglercraft cloud saves:', error);
      })
  };
}());
