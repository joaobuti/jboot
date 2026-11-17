<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('fiscal:reenviar-contingencias')->everyFiveMinutes();
