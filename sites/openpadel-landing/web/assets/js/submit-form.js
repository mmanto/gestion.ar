function initSubmitBooking() {
    $("#booking-form").on("submit", function (e) {
        e.preventDefault();

        const name = $("#name").val().trim();
        const email = $("#email").val().trim();
        const phone = $("#phone").val().trim();
        const date = $("#date").val().trim();
        const time = $("#time").val().trim();
        const court = $("#court").val().trim();

        $("#success-message").addClass("hidden");
        $("#error-message").addClass("hidden");

        if (name && email && phone && date && time && court) {
            $("#success-message").removeClass("hidden");
            setTimeout(function() {
                $("#success-message").addClass("hidden");
                $("#booking-form")[0].reset();
            }, 3000);
        } else {
            $("#error-message").removeClass("hidden");
            setTimeout(function() {
                $("#error-message").addClass("hidden");
            }, 3000);
        }
    });
}

$(document).ready(function () {
    initSubmitBooking();
});

function initSubmitNewsletter() {
    $('#newsletter-form').on("submit", function(e){
        e.preventDefault();
        const newsletter = $('#newsletter').val().trim();

        $("#newsletter-success").addClass("hidden");
        $("#newsletter-error").addClass("hidden");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newsletter)) {
        $("#newsletter-error").removeClass("hidden");
        $("#newsletter-success").addClass("hidden");
        setTimeout(function() {
            $("#newsletter-error").addClass("hidden");
            $("#newsletter-form")[0].reset();
        }, 3000);
    } else {
        $("#newsletter-success").removeClass("hidden");
        $("#newsletter-error").addClass("hidden");
        setTimeout(function() {
            $("#newsletter-success").addClass("hidden");
        }, 3000);
    }
    })
}

$(document).ready(function (){
    initSubmitNewsletter();
})

function initSubmitForm(formId, successMessageId, errorMessageId) {
    $(formId).on("submit", function (e) {
        e.preventDefault();

        const name = $(`${formId} #name`).val().trim();
        const email = $(`${formId} #email`).val().trim();
        const phone = $(`${formId} #phone`).val().trim();
        const subject = $(`${formId} #subject`).val().trim();
        const message = $(`${formId} #message`).val().trim();

        $(successMessageId).addClass("hidden");
        $(errorMessageId).addClass("hidden");

        if (name && email && phone && subject && message) {
            $(successMessageId).removeClass("hidden");
            setTimeout(function() {
                $(successMessageId).addClass("hidden");
                $(formId)[0].reset(); // Reset form setelah sukses
            }, 3000);
        } else {
            $(errorMessageId).removeClass("hidden");
            setTimeout(function() {
                $(errorMessageId).addClass("hidden");
            }, 3000);
        }
    });
}

$(document).ready(function () {
    initSubmitForm("#question-form", "#success-message", "#error-message");
    initSubmitForm("#contact-form", "#success-message", "#error-message");
});